import { db, j, parse } from '../../db/index.js';
import { emit } from '../../utils/events.js';
import { getProfile, latestResume, saveMatch, upsertJob } from '../../services/store.js';
import { ai } from '../../services/ai/index.js';
import { callTool } from '../../mcp/tools.js';
import { connectorStates } from '../../connectors/manager.js';
import { createGoalPlan, describeGoal, PLAN_STEPS } from '../planner/index.js';
import { TaskTracker } from '../recovery/index.js';
import { dedupe, scoreJob } from '../matching/index.js';
import type { NormalizedJob } from '../../connectors/types.js';
import type { CandidateProfile, ParsedGoal } from '../../types.js';

const active = new Set<number>();
export const isRunning = (userId: number) => active.has(userId);
const MAX_PREPARE = 12;

const valid = (job: NormalizedJob) => {
  try { const url = new URL(job.applicationUrl); return !!(job.title && job.company && ['http:', 'https:'].includes(url.protocol)); }
  catch { return false; }
};

export function startRun(userId: number, goal: string): number {
  if (active.has(userId)) throw Object.assign(new Error('An agent run is already in progress'), { status: 409 });
  const runId = Number(db.prepare('INSERT INTO agent_runs (user_id, goal, status) VALUES (?,?,?)').run(userId, goal, 'running').lastInsertRowid);
  active.add(userId);
  // Fire-and-forget: the HTTP request returns immediately; progress streams over SSE and is persisted.
  executeRun(userId, runId, goal).catch((e) => console.error('[agent] unhandled', e)).finally(() => active.delete(userId));
  return runId;
}

async function executeRun(userId: number, runId: number, goal: string) {
  const tracker = new TaskTracker(runId, userId);
  tracker.register(PLAN_STEPS);
  const stats: Record<string, any> = { jobsFound: 0, uniqueJobs: 0, duplicatesRemoved: 0, eligible: 0, potentiallyEligible: 0, notEligible: 0, needsReview: 0, strongMatches: 0, prepared: 0, sources: [] };
  const finish = (status: string, error?: string) => {
    db.prepare("UPDATE agent_runs SET status=?, stats=?, error=?, finished_at=datetime('now') WHERE id=?").run(status, j(stats), error ?? null, runId);
  };
  emit(userId, runId, 'AGENT_STARTED', `HYRD agent started: "${goal}"`, { goal });
  try {
    // 1. profile
    const profile = (await tracker.run('load_profile', async () => {
      const p = getProfile(userId); const r = latestResume(userId);
      if (!p.skills.length && !r) throw Object.assign(new Error('No skills or resume found. Upload a resume or add skills in Profile first.'), { retryable: false });
      return p;
    }, { retries: 0, critical: true, detail: (p) => `${p.skills.length} skills${latestResume(userId) ? ', resume on file' : ', no resume uploaded'}` })) as CandidateProfile;

    // 2. goal → plan
    const parsed = (await tracker.run('understand_goal', () => createGoalPlan(goal, profile), { critical: true, detail: (g) => `${g.roles.join(', ')} | min ${g.minMatch}%` })) as ParsedGoal;
    db.prepare('UPDATE agent_runs SET parsed_goal=? WHERE id=?').run(j(parsed), runId);
    emit(userId, runId, 'PLAN_CREATED', 'Goal understood', { goal: parsed, summary: describeGoal(parsed), steps: tracker.tasks() });

    // goal overrides stored preferences for this run (never invents qualifications)
    const eff: CandidateProfile = { ...profile, preferences: {
      ...profile.preferences, roles: parsed.roles.length ? parsed.roles : profile.preferences.roles,
      locations: parsed.locations.length ? parsed.locations : profile.preferences.locations,
      workModes: parsed.remoteOk ? [...new Set([...profile.preferences.workModes, 'Remote'])] : profile.preferences.workModes,
      employmentTypes: parsed.employmentTypes.length ? parsed.employmentTypes : profile.preferences.employmentTypes } };

    // 3. discover sources
    const states = (await tracker.run('discover_sources', () => connectorStates(userId), { detail: (s) => `${s.filter((x) => x.enabled && ['connected', 'available'].includes(x.status)).length} of ${s.filter((x) => x.enabled).length} enabled sources reachable` })) || [];
    for (const s of states) if (s.enabled && !['connected', 'available'].includes(s.status)) emit(userId, runId, 'INFO', `${s.label}: ${s.status.replace(/_/g, ' ')} — ${s.message}`, { source: s.source, status: s.status });

    // 4. search (parallel connectors; each failure isolated + retried once with backoff)
    const results: any[] = (await tracker.run('search', async () => callTool({
      userId, runId, hooks: {
        onStart: (c) => emit(userId, runId, 'SOURCE_SEARCH_STARTED', `Searching ${c.info.label}…`, { source: c.info.source }),
        onDone: (r) => emit(userId, runId, r.status === 'connected' ? 'SOURCE_SEARCH_COMPLETED' : 'SOURCE_SEARCH_FAILED',
          r.status === 'connected' ? `${r.label}: ${r.jobs.length} listings` : `${r.label}: ${r.status.replace(/_/g, ' ')} — ${r.message}`, { source: r.source, status: r.status, count: r.jobs.length, attempts: r.attempts }),
      },
    }, 'search_jobs', { keywords: [...new Set([...parsed.roles, ...profile.preferences.roles, ...parsed.keywords, ...profile.skills, ...(parsed.employmentTypes.includes('Internship') ? ['internship'] : [])])].slice(0, 10), locations: parsed.locations, remoteOk: parsed.remoteOk, remoteOnly: false }), { retries: 0, detail: (r: any[]) => `${r.reduce((n, x) => n + x.jobs.length, 0)} listings from ${r.filter((x) => x.status === 'connected').length} sources` })) || [];
    stats.sources = results.map((r) => ({ source: r.source, label: r.label, status: r.status, count: r.jobs.length, attempts: r.attempts, message: r.message }));
    const raw: NormalizedJob[] = results.flatMap((r) => r.jobs);
    stats.jobsFound = raw.length;
    emit(userId, runId, 'JOBS_FOUND', `Found ${raw.length} listings`, { count: raw.length, sources: stats.sources });

    // 5. normalize/validate
    const clean = (await tracker.run('normalize', async () => raw.filter(valid), { detail: (v) => `${v.length} valid of ${raw.length}` })) || [];
    // 6. dedupe
    const dd = (await tracker.run('dedupe', async () => dedupe(clean), { detail: (d) => `${d.removed} duplicates removed → ${d.unique.length} unique` })) || { unique: [], removed: 0 };
    stats.uniqueJobs = dd.unique.length; stats.duplicatesRemoved = dd.removed;
    emit(userId, runId, 'DUPLICATES_REMOVED', `${dd.removed} duplicates removed → ${dd.unique.length} unique jobs`, { removed: dd.removed, unique: dd.unique.length });

    // 7+8. eligibility + matching, persisted
    emit(userId, runId, 'MATCHING_STARTED', `Analyzing ${dd.unique.length} jobs against your profile`, {});
    const scored: Array<{ id: number; score: number; eligibility: string; job: any }> = [];
    await tracker.run('eligibility', async () => {
      const tx = db.transaction(() => {
        for (const job of dd.unique) {
          const id = upsertJob(userId, job as any);
          const m = scoreJob(eff, job, parsed.employmentTypes);
          saveMatch(userId, id, runId, m, '');
          scored.push({ id, score: m.score, eligibility: m.eligibility, job: { ...job, ...m } });
        }
      });
      tx();
      return scored.length;
    }, { detail: () => `${scored.filter((s) => s.eligibility !== 'Not Eligible').length} not ruled out of ${scored.length}` });
    stats.eligible = scored.filter((s) => s.eligibility === 'Eligible').length;
    stats.potentiallyEligible = scored.filter((s) => s.eligibility === 'Potentially Eligible').length;
    stats.notEligible = scored.filter((s) => s.eligibility === 'Not Eligible').length;
    stats.needsReview = scored.filter((s) => s.eligibility === 'Needs Review' || s.eligibility === 'Unknown').length;
    await tracker.run('match', async () => {
      scored.sort((a, b) => b.score - a.score);
      // LLM/plain-language explanations for the top matches only (bounded cost); score is never changed by AI.
      for (const s of scored.slice(0, 15)) {
        const exp = await ai.explainMatch(eff, { title: s.job.title, company: s.job.company, description: s.job.description || '', skills: s.job.skills, location: s.job.location || '', employmentType: s.job.employmentType || '' }, { score: s.score, matchedSkills: s.job.matchedSkills, missingSkills: s.job.missingSkills, eligibility: s.eligibility });
        db.prepare('UPDATE job_matches SET explanation=? WHERE user_id=? AND job_id=?').run(exp, userId, s.id);
      }
      return scored.length;
    }, { detail: () => `${scored.filter((s) => s.score >= parsed.minMatch && s.eligibility !== 'Not Eligible').length} at or above ${parsed.minMatch}%` });
    const strong = scored.filter((s) => s.score >= parsed.minMatch && ['Eligible', 'Potentially Eligible'].includes(s.eligibility));
    stats.strongMatches = strong.length;
    emit(userId, runId, 'MATCHING_COMPLETED', `${stats.eligible} eligible • ${strong.length} strong matches (≥${parsed.minMatch}%)`, { eligible: stats.eligible, strong: strong.length });

    // 9. prepare (only if the goal asked for it)
    let prepared = 0;
    if (parsed.action === 'prepare' && strong.length) {
      await tracker.run('prepare', async () => {
        for (const s of strong.slice(0, MAX_PREPARE)) {
          try { const r: any = await callTool({ userId, runId }, 'prepare_application', { jobId: s.id }); if (r.created) prepared++; } catch (e: any) { emit(userId, runId, 'INFO', `Could not prepare ${s.job.title}: ${e.message}`, {}); }
        }
        return prepared;
      }, { detail: () => `${prepared} application packages ready` });
    } else tracker.skip('prepare', parsed.action === 'prepare' ? 'No jobs reached the match threshold' : 'Goal was search-only');
    stats.prepared = prepared;

    // 10. human approval gate
    const pending = (db.prepare("SELECT COUNT(*) c FROM applications WHERE user_id=? AND status='Awaiting Approval'").get(userId) as any).c;
    if (pending > 0) {
      tracker.wait('approval', `${pending} application(s) waiting for your approval`);
      emit(userId, runId, 'APPROVAL_REQUIRED', `${pending} application(s) ready — waiting for human approval`, { pending });
    } else tracker.skip('approval', 'Nothing to approve');

    const noSource = stats.sources.length && stats.sources.every((s: any) => s.status !== 'connected');
    finish(pending > 0 ? 'awaiting_approval' : 'completed', noSource ? 'No source returned listings; see source statuses.' : undefined);
    emit(userId, runId, 'AGENT_COMPLETED', pending > 0 ? 'Agent finished — waiting for human approval' : noSource ? 'Agent finished — no source was reachable' : 'Agent finished', { stats });
  } catch (e: any) {
    finish('failed', e.message);
    emit(userId, runId, 'AGENT_FAILED', e.message, { stats });
  }
}

export function getRun(userId: number, id: number) {
  const r: any = db.prepare('SELECT * FROM agent_runs WHERE id=? AND user_id=?').get(id, userId);
  if (!r) return null;
  return { id: r.id, goal: r.goal, parsedGoal: parse(r.parsed_goal, {}), status: r.status, stats: parse(r.stats, {}), error: r.error, startedAt: r.started_at, finishedAt: r.finished_at,
    tasks: db.prepare('SELECT key,label,status,detail,attempts FROM agent_tasks WHERE run_id=? ORDER BY seq').all(id),
    connectorRuns: db.prepare('SELECT source,status,jobs_found AS jobsFound,attempts,message,duration_ms AS durationMs FROM connector_runs WHERE run_id=?').all(id) };
}
export const listRuns = (userId: number, limit = 20) => (db.prepare('SELECT id FROM agent_runs WHERE user_id=? ORDER BY id DESC LIMIT ?').all(userId, limit) as any[]).map((r) => getRun(userId, r.id));
