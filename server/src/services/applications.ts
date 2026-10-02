import { db, parse } from '../db/index.js';
import { emit } from '../utils/events.js';
import { ai } from './ai/index.js';
import { getJob, getProfile, latestResume } from './store.js';

export const STATUSES = ['Discovered', 'Matched', 'Prepared', 'Awaiting Approval', 'Approved', 'Applying', 'Submitted', 'Under Review', 'Interview', 'Offer', 'Rejected', 'Withdrawn', 'Failed'] as const;
export type AppStatus = (typeof STATUSES)[number];

export function addHistory(appId: number, status: string, message: string) {
  db.prepare('INSERT INTO application_history (application_id,status,message) VALUES (?,?,?)').run(appId, status, message);
}
export function setStatus(appId: number, status: AppStatus, message: string, extra: { method?: string; result?: string; human?: string | null } = {}) {
  db.prepare(`UPDATE applications SET status=?, updated_at=datetime('now'),
    execution_method=COALESCE(?,execution_method), execution_result=COALESCE(?,execution_result), human_action_required=? WHERE id=?`)
    .run(status, extra.method ?? null, extra.result ?? null, extra.human ?? null, appId);
  addHistory(appId, status, message);
}

export function getApplication(userId: number, id: number) {
  const a: any = db.prepare('SELECT * FROM applications WHERE id=? AND user_id=?').get(id, userId);
  if (!a) return null;
  const job = getJob(userId, a.job_id);
  const docs: any[] = db.prepare('SELECT * FROM application_documents WHERE application_id=?').all(id);
  const answers = db.prepare('SELECT id,question,answer,edited FROM application_answers WHERE application_id=? ORDER BY id').all(id);
  const cover = docs.find((d) => d.kind === 'cover_letter');
  const resume = docs.find((d) => d.kind === 'resume');
  return {
    id: a.id, status: a.status, executionMethod: a.execution_method, executionResult: a.execution_result, humanActionRequired: a.human_action_required,
    createdAt: a.created_at, updatedAt: a.updated_at, job, coverLetter: cover?.content || '', resume: resume ? { filename: resume.filename, id: resume.resume_id } : null, answers,
  };
}
export function listApplications(userId: number, status?: string) {
  const rows: any[] = status ? db.prepare('SELECT id FROM applications WHERE user_id=? AND status=? ORDER BY updated_at DESC').all(userId, status) : db.prepare('SELECT id FROM applications WHERE user_id=? ORDER BY updated_at DESC').all(userId);
  return rows.map((r) => getApplication(userId, r.id)!);
}
export const getHistory = (appId: number) => db.prepare('SELECT status,message,created_at AS createdAt FROM application_history WHERE application_id=? ORDER BY id').all(appId);

/** Prepare a package (cover letter, answers, resume ref) and queue it for human approval. Idempotent per job. */
export async function prepareApplication(userId: number, jobId: number, runId: number | null = null): Promise<{ id: number; created: boolean }> {
  const job = getJob(userId, jobId);
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 });
  const existing: any = db.prepare('SELECT id,status FROM applications WHERE user_id=? AND job_id=?').get(userId, jobId);
  if (existing && !['Withdrawn', 'Failed'].includes(existing.status)) return { id: existing.id, created: false };
  const profile = getProfile(userId);
  const resume = latestResume(userId);
  const m = { score: job.match?.score ?? 0, matchedSkills: job.match?.matchedSkills ?? [], missingSkills: job.match?.missingSkills ?? [], eligibility: job.match?.eligibility ?? 'Unknown' };
  const jl = { title: job.title, company: job.company, description: job.description || '', skills: job.skills, location: job.location || '', employmentType: job.employmentType || '' };
  const [cover, answers] = await Promise.all([ai.generateCoverLetter(profile, jl, m), ai.generateApplicationAnswers(profile, jl, m)]);

  let appId: number;
  if (existing) {
    appId = existing.id;
    db.prepare('DELETE FROM application_answers WHERE application_id=?').run(appId);
    db.prepare('DELETE FROM application_documents WHERE application_id=?').run(appId);
  } else {
    appId = Number(db.prepare('INSERT INTO applications (user_id,job_id,run_id,status) VALUES (?,?,?,?)').run(userId, jobId, runId, 'Discovered').lastInsertRowid);
    addHistory(appId, 'Discovered', `Job discovered on ${job.source}`);
    addHistory(appId, 'Matched', `Resume match completed (${m.score}%, ${m.eligibility})`);
  }
  db.prepare('INSERT INTO application_documents (application_id,kind,filename,content) VALUES (?,?,?,?)').run(appId, 'cover_letter', 'cover-letter.txt', cover);
  if (resume) db.prepare('INSERT INTO application_documents (application_id,kind,filename,resume_id) VALUES (?,?,?,?)').run(appId, 'resume', resume.filename, resume.id);
  const ins = db.prepare('INSERT INTO application_answers (application_id,question,answer) VALUES (?,?,?)');
  for (const a of answers) ins.run(appId, a.question, a.answer);
  setStatus(appId, 'Prepared', resume ? 'Application package prepared' : 'Application package prepared (no resume uploaded yet)');
  setStatus(appId, 'Awaiting Approval', 'Waiting for human approval before any submission');
  emit(userId, runId, 'APPLICATION_PREPARED', `Prepared application: ${job.title} @ ${job.company}`, { applicationId: appId, jobId });
  return { id: appId, created: true };
}

export function updateApplicationContent(userId: number, id: number, body: { coverLetter?: string; answers?: Array<{ id: number; answer: string }> }) {
  const a: any = db.prepare('SELECT status FROM applications WHERE id=? AND user_id=?').get(id, userId);
  if (!a) throw Object.assign(new Error('Application not found'), { status: 404 });
  if (!['Prepared', 'Awaiting Approval', 'Approved'].includes(a.status)) throw Object.assign(new Error(`Cannot edit an application that is ${a.status}`), { status: 409 });
  if (typeof body.coverLetter === 'string') db.prepare(`UPDATE application_documents SET content=? WHERE application_id=? AND kind='cover_letter'`).run(body.coverLetter.slice(0, 8000), id);
  for (const x of body.answers || []) db.prepare('UPDATE application_answers SET answer=?, edited=1 WHERE id=? AND application_id=?').run(String(x.answer).slice(0, 4000), x.id, id);
  addHistory(id, a.status, 'Application content edited by you');
  // Editing after approval invalidates it: human must re-approve what will actually be sent.
  if (a.status === 'Approved') setStatus(id, 'Awaiting Approval', 'Content changed after approval — re-approval required');
}

export function approve(userId: number, id: number) {
  const a: any = db.prepare('SELECT status FROM applications WHERE id=? AND user_id=?').get(id, userId);
  if (!a) throw Object.assign(new Error('Application not found'), { status: 404 });
  if (a.status !== 'Awaiting Approval' && a.status !== 'Prepared') throw Object.assign(new Error(`Cannot approve an application that is ${a.status}`), { status: 409 });
  setStatus(id, 'Approved', 'Human approved');
}
export function reject(userId: number, id: number) {
  const a: any = db.prepare('SELECT status FROM applications WHERE id=? AND user_id=?').get(id, userId);
  if (!a) throw Object.assign(new Error('Application not found'), { status: 404 });
  if (['Submitted', 'Under Review', 'Interview', 'Offer'].includes(a.status)) throw Object.assign(new Error('Already submitted'), { status: 409 });
  setStatus(id, 'Withdrawn', 'Human rejected this application');
}
export const answersOf = (id: number) => db.prepare('SELECT question,answer FROM application_answers WHERE application_id=? ORDER BY id').all(id) as Array<{ question: string; answer: string }>;
export const coverOf = (id: number): string => (db.prepare(`SELECT content FROM application_documents WHERE application_id=? AND kind='cover_letter'`).get(id) as any)?.content || '';
