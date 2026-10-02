import { db, j, parse } from '../db/index.js';
import { CandidateProfile, emptyProfile } from '../types.js';
import type { NormalizedJob } from '../connectors/types.js';

export function getProfile(userId: number): CandidateProfile {
  const u: any = db.prepare('SELECT name,email FROM users WHERE id=?').get(userId);
  const row: any = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(userId);
  const base = emptyProfile(u?.name, u?.email);
  const saved = parse<Partial<CandidateProfile>>(row?.data, {});
  return { ...base, ...saved, education: { ...base.education, ...(saved.education || {}) }, preferences: { ...base.preferences, ...(saved.preferences || {}) } } as CandidateProfile;
}
export function saveProfile(userId: number, p: CandidateProfile) {
  db.prepare(`INSERT INTO profiles (user_id, data, updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at`).run(userId, JSON.stringify(p));
}
export const latestResume = (userId: number): any => db.prepare('SELECT * FROM resumes WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId);

const jobSelect = `SELECT jobs.*, m.score, m.breakdown, m.matched_skills, m.missing_skills, m.eligibility, m.eligibility_notes, m.explanation,
  a.id AS application_id, a.status AS application_status
  FROM jobs LEFT JOIN job_matches m ON m.job_id=jobs.id LEFT JOIN applications a ON a.job_id=jobs.id`;
export function rowToJob(r: any) {
  return {
    id: r.id, source: r.source, sourceJobId: r.source_job_id, title: r.title, company: r.company, location: r.location, workMode: r.work_mode,
    description: r.description, skills: parse(r.skills, []), experience: r.experience, salary: r.salary, employmentType: r.employment_type,
    postedDate: r.posted_date, applicationUrl: r.application_url, applicationMethod: r.application_method, alsoOn: parse(r.also_on, []),
    sourceMetadata: parse(r.source_metadata, {}), isDemo: !!r.is_demo, fetchedAt: r.fetched_at,
    match: r.score == null ? null : { score: r.score, breakdown: parse(r.breakdown, {}), matchedSkills: parse(r.matched_skills, []), missingSkills: parse(r.missing_skills, []), eligibility: r.eligibility, eligibilityNotes: parse(r.eligibility_notes, []), explanation: r.explanation },
    application: r.application_id ? { id: r.application_id, status: r.application_status } : null,
  };
}
export const getJob = (userId: number, id: number) => { const r = db.prepare(`${jobSelect} WHERE jobs.user_id=? AND jobs.id=?`).get(userId, id); return r ? rowToJob(r) : null; };

export function upsertJob(userId: number, job: NormalizedJob & { dedupeKey: string; alsoOn: string[] }): number {
  db.prepare(`INSERT INTO jobs (user_id,source,source_job_id,dedupe_key,title,company,location,work_mode,description,skills,experience,salary,employment_type,posted_date,application_url,application_method,also_on,source_metadata,is_demo,fetched_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id,source,source_job_id) DO UPDATE SET dedupe_key=excluded.dedupe_key,title=excluded.title,description=excluded.description,skills=excluded.skills,location=excluded.location,
      work_mode=excluded.work_mode,experience=excluded.experience,salary=excluded.salary,employment_type=excluded.employment_type,posted_date=excluded.posted_date,application_url=excluded.application_url,
      also_on=excluded.also_on,source_metadata=excluded.source_metadata,fetched_at=excluded.fetched_at`)
    .run(userId, job.source, job.sourceJobId, job.dedupeKey, job.title, job.company, job.location, job.workMode, job.description, j(job.skills), job.experience, job.salary, job.employmentType, job.postedDate, job.applicationUrl, job.applicationMethod, j(job.alsoOn), j(job.sourceMetadata), job.isDemo ? 1 : 0);
  const r: any = db.prepare('SELECT id FROM jobs WHERE user_id=? AND source=? AND source_job_id=?').get(userId, job.source, job.sourceJobId);
  return r.id;
}
export function saveMatch(userId: number, jobId: number, runId: number | null, m: any, explanation: string) {
  db.prepare(`INSERT INTO job_matches (user_id,job_id,run_id,score,breakdown,matched_skills,missing_skills,eligibility,eligibility_notes,explanation)
    VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,job_id) DO UPDATE SET run_id=excluded.run_id,score=excluded.score,breakdown=excluded.breakdown,matched_skills=excluded.matched_skills,
    missing_skills=excluded.missing_skills,eligibility=excluded.eligibility,eligibility_notes=excluded.eligibility_notes,explanation=excluded.explanation,created_at=datetime('now')`)
    .run(userId, jobId, runId, m.score, j(m.breakdown), j(m.matchedSkills), j(m.missingSkills), m.eligibility, j(m.eligibilityNotes), explanation);
}

export interface JobFilters { minMatch?: number; company?: string; role?: string; location?: string; workMode?: string; type?: string; source?: string; experience?: string; postedWithinDays?: number; sort?: string; eligibility?: string; limit?: number; offset?: number; q?: string }
export function listJobs(userId: number, f: JobFilters) {
  const where = ['jobs.user_id=?']; const args: any[] = [userId];
  if (f.minMatch) { where.push('m.score>=?'); args.push(f.minMatch); }
  if (f.company) { where.push('jobs.company LIKE ?'); args.push(`%${f.company}%`); }
  if (f.role || f.q) { where.push('jobs.title LIKE ?'); args.push(`%${f.role || f.q}%`); }
  if (f.location) { where.push('jobs.location LIKE ?'); args.push(`%${f.location}%`); }
  if (f.workMode) { where.push('jobs.work_mode=?'); args.push(f.workMode); }
  if (f.type) { where.push('jobs.employment_type=?'); args.push(f.type); }
  if (f.source) { where.push('(jobs.source=? OR jobs.also_on LIKE ?)'); args.push(f.source, `%"${f.source}"%`); }
  if (f.eligibility) { where.push('m.eligibility=?'); args.push(f.eligibility); }
  if (f.experience === 'none') { where.push('(jobs.experience IS NULL)'); }
  if (f.postedWithinDays) { where.push("jobs.posted_date >= datetime('now', ?)"); args.push(`-${f.postedWithinDays} days`); }
  const order = { newest: 'jobs.posted_date DESC', company: 'jobs.company ASC', role: 'jobs.title ASC', best: 'm.score DESC, jobs.posted_date DESC' }[f.sort || 'best'] || 'm.score DESC';
  const base = `FROM jobs LEFT JOIN job_matches m ON m.job_id=jobs.id LEFT JOIN applications a ON a.job_id=jobs.id WHERE ${where.join(' AND ')}`;
  const total = (db.prepare(`SELECT COUNT(*) c ${base}`).get(...args) as any).c;
  const rows = db.prepare(`${jobSelect.replace(/ FROM jobs.*/s, '')} ${base} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...args, Math.min(f.limit || 50, 200), f.offset || 0);
  return { total, jobs: rows.map(rowToJob) };
}
