import { db } from '../../db/index.js';
import { emit } from '../../utils/events.js';
import { sleep } from '../../utils/http.js';

/** Runs one agent task with state persisted so a failed step is retried (with backoff) without restarting the workflow. */
export class TaskTracker {
  private seq = 0;
  constructor(private runId: number, private userId: number) {}
  register(steps: Array<{ key: string; label: string }>) {
    const ins = db.prepare('INSERT INTO agent_tasks (run_id, seq, key, label) VALUES (?,?,?,?)');
    for (const s of steps) ins.run(this.runId, ++this.seq, s.key, s.label);
  }
  private set(key: string, patch: { status: string; detail?: string; attempts?: number }) {
    db.prepare(`UPDATE agent_tasks SET status=?, detail=COALESCE(?,detail), attempts=COALESCE(?,attempts),
      started_at=CASE WHEN ?='running' THEN datetime('now') ELSE started_at END,
      finished_at=CASE WHEN ? IN ('done','failed','skipped','waiting') THEN datetime('now') ELSE finished_at END WHERE run_id=? AND key=?`)
      .run(patch.status, patch.detail ?? null, patch.attempts ?? null, patch.status, patch.status, this.runId, key);
    const row: any = db.prepare('SELECT label FROM agent_tasks WHERE run_id=? AND key=?').get(this.runId, key);
    emit(this.userId, this.runId, 'TASK_UPDATED', row?.label || key, { key, status: patch.status, detail: patch.detail });
  }
  async run<T>(key: string, fn: () => Promise<T>, opts: { retries?: number; critical?: boolean; detail?: (v: T) => string } = {}): Promise<T | undefined> {
    const retries = opts.retries ?? 1;
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      this.set(key, { status: 'running', attempts: attempt });
      try {
        const v = await fn();
        this.set(key, { status: 'done', detail: opts.detail?.(v), attempts: attempt });
        return v;
      } catch (e: any) {
        if (attempt > retries) {
          this.set(key, { status: 'failed', detail: e.message, attempts: attempt });
          if (opts.critical) throw e;
          return undefined;
        }
        emit(this.userId, this.runId, 'INFO', `Step "${key}" failed (${e.message}); retrying with backoff`, { key, attempt });
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
  }
  skip(key: string, why: string) { this.set(key, { status: 'skipped', detail: why }); }
  wait(key: string, detail: string) { this.set(key, { status: 'waiting', detail }); }
  tasks() { return db.prepare('SELECT key,label,status,detail,attempts FROM agent_tasks WHERE run_id=? ORDER BY seq').all(this.runId); }
}
