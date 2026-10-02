import { EventEmitter } from 'node:events';
import { db, parse } from '../db/index.js';

export type AgentEventType =
  | 'AGENT_STARTED' | 'PLAN_CREATED' | 'TASK_UPDATED' | 'SOURCE_SEARCH_STARTED' | 'SOURCE_SEARCH_COMPLETED'
  | 'SOURCE_SEARCH_FAILED' | 'JOBS_FOUND' | 'DUPLICATES_REMOVED' | 'MATCHING_STARTED' | 'MATCHING_COMPLETED'
  | 'APPLICATION_PREPARED' | 'APPROVAL_REQUIRED' | 'APPLICATION_STARTED' | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_VERIFIED' | 'HUMAN_ACTION_REQUIRED' | 'AGENT_COMPLETED' | 'AGENT_FAILED' | 'INFO';

export const bus = new EventEmitter();
bus.setMaxListeners(200);

const insert = db.prepare('INSERT INTO activity_log (user_id, run_id, type, message, data) VALUES (?,?,?,?,?)');

export function emit(userId: number, runId: number | null, type: AgentEventType, message: string, data: any = {}) {
  const info = insert.run(userId, runId, type, message, JSON.stringify(data));
  const evt = { id: Number(info.lastInsertRowid), runId, type, message, data, createdAt: new Date().toISOString() };
  bus.emit(`user:${userId}`, evt);
  return evt;
}

export function recentActivity(userId: number, limit = 200, runId?: number) {
  const rows: any[] = runId
    ? db.prepare('SELECT * FROM activity_log WHERE user_id=? AND run_id=? ORDER BY id DESC LIMIT ?').all(userId, runId, limit)
    : db.prepare('SELECT * FROM activity_log WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, limit);
  return rows.map((r) => ({ id: r.id, runId: r.run_id, type: r.type, message: r.message, data: parse(r.data, {}), createdAt: r.created_at })).reverse();
}
