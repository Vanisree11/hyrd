import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db, j, parse } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth, signToken, verifyToken, type AuthedRequest } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { bus, emit, recentActivity } from '../utils/events.js';
import { getProfile, saveProfile, latestResume, listJobs, getJob } from '../services/store.js';
import { ai, aiInfo } from '../services/ai/index.js';
import { extractText, sniff } from '../services/resume.js';
import { emptyProfile } from '../types.js';
import { connectorStates, getConnector, setConnector } from '../connectors/manager.js';
import { getRun, isRunning, listRuns, startRun } from '../agents/hyrdAgent/index.js';
import * as apps from '../services/applications.js';
import { ApplicationExecutor } from '../agents/application/executor.js';
import { callTool, toolList } from '../mcp/tools.js';
import { playwrightAvailable } from '../browser/browserManager.js';

export const api = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 40, standardHeaders: true, legacyHeaders: false });
const auth = requireAuth();
const uid = (req: any) => (req as AuthedRequest).userId;

// ---------- auth ----------
const creds = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200) });
api.post('/auth/register', authLimiter, wrap(async (req, res) => {
  const b = creds.extend({ name: z.string().trim().min(1).max(100) }).parse(req.body);
  const email = b.email.toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'Email already registered' });
  const id = Number(db.prepare('INSERT INTO users (email,password_hash,name) VALUES (?,?,?)').run(email, await bcrypt.hash(b.password, 11), b.name).lastInsertRowid);
  saveProfile(id, emptyProfile(b.name, email));
  res.status(201).json({ token: signToken(id), user: { id, email, name: b.name } });
}));
api.post('/auth/login', authLimiter, wrap(async (req, res) => {
  const b = creds.parse(req.body);
  const u: any = db.prepare('SELECT * FROM users WHERE email=?').get(b.email.toLowerCase());
  if (!u || !(await bcrypt.compare(b.password, u.password_hash))) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: signToken(u.id), user: { id: u.id, email: u.email, name: u.name } });
}));
// Stateless JWT: logout is client-side token disposal; endpoint exists for symmetry and returns 204.
api.post('/auth/logout', (_req, res) => res.status(204).end());
api.get('/auth/me', auth, wrap((req, res) => res.json(db.prepare('SELECT id,email,name FROM users WHERE id=?').get(uid(req)))));

// ---------- profile ----------
const profileSchema = z.object({
  name: z.string().max(100), email: z.string().max(200), phone: z.string().max(40), summary: z.string().max(1000),
  education: z.object({ degree: z.string().max(100), branch: z.string().max(100), college: z.string().max(200), gradYear: z.number().int().min(1990).max(2100).nullable(), cgpa: z.string().max(10) }),
  skills: z.array(z.string().max(60)).max(80), languages: z.array(z.string().max(40)).max(40), frameworks: z.array(z.string().max(40)).max(40),
  projects: z.array(z.object({ name: z.string().max(120), description: z.string().max(1000) })).max(20),
  certifications: z.array(z.string().max(200)).max(30), experience: z.array(z.string().max(500)).max(30), achievements: z.array(z.string().max(300)).max(30),
  preferences: z.object({ roles: z.array(z.string().max(80)).max(20), locations: z.array(z.string().max(80)).max(20), workModes: z.array(z.enum(['Remote', 'Hybrid', 'Onsite'])).max(3),
    employmentTypes: z.array(z.enum(['Internship', 'Full-time', 'Part-time', 'Contract'])).max(4), experienceYears: z.number().min(0).max(40), salaryPreference: z.string().max(100), other: z.string().max(500) }),
});
api.get('/profile', auth, wrap((req, res) => res.json(getProfile(uid(req)))));
api.put('/profile', auth, wrap((req, res) => { const p = profileSchema.parse(req.body); saveProfile(uid(req), p as any); res.json(p); }));

// ---------- resume ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
api.post('/resume/upload', auth, upload.single('resume'), wrap(async (req, res) => {
  const f = (req as any).file as Express.Multer.File | undefined;
  if (!f) return res.status(400).json({ error: 'No file uploaded (field name: resume)' });
  const kind = sniff(f.buffer);
  const okName = /\.(pdf|docx)$/i.test(f.originalname);
  if (!kind || !okName || (kind === 'pdf') !== /\.pdf$/i.test(f.originalname)) return res.status(400).json({ error: 'Only valid PDF or DOCX files are accepted' });
  const userId = uid(req);
  const dir = path.join(config.uploadDir, String(userId)); fs.mkdirSync(dir, { recursive: true });
  const stored = path.join(dir, `${crypto.randomUUID()}.${kind}`);
  fs.writeFileSync(stored, f.buffer);
  let text = '';
  try { text = await extractText(stored, kind); } catch (e: any) { fs.unlinkSync(stored); return res.status(422).json({ error: `Could not read the document: ${e.message}` }); }
  if (text.length < 40) { fs.unlinkSync(stored); return res.status(422).json({ error: 'No readable text found (scanned image PDFs are not supported). Try a text-based PDF or DOCX.' }); }
  const u: any = db.prepare('SELECT name,email FROM users WHERE id=?').get(userId);
  const parsed = await ai.analyzeResume(text, u);
  const safeName = path.basename(f.originalname).replace(/[^\w.\- ]/g, '_').slice(0, 120);
  const id = Number(db.prepare('INSERT INTO resumes (user_id,filename,stored_path,mime,text,parsed) VALUES (?,?,?,?,?,?)').run(userId, safeName, stored, kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', text, j(parsed)).lastInsertRowid);
  // Merge into profile without clobbering user-entered preferences
  const cur = getProfile(userId);
  const merged = { ...cur, ...parsed, preferences: cur.preferences, name: parsed.name || cur.name, email: cur.email || parsed.email };
  saveProfile(userId, merged);
  res.status(201).json({ id, filename: safeName, characters: text.length, profile: merged, analyzedBy: ai.name });
}));
api.get('/resume', auth, wrap((req, res) => {
  const r = latestResume(uid(req));
  res.json(r ? { id: r.id, filename: r.filename, uploadedAt: r.created_at, text: r.text, parsed: parse(r.parsed, {}) } : null);
}));

// ---------- agent ----------
api.post('/agent/run', auth, wrap((req, res) => {
  const { goal } = z.object({ goal: z.string().trim().min(5).max(1000) }).parse(req.body);
  const runId = startRun(uid(req), goal);
  res.status(202).json({ runId });
}));
api.get('/agent/runs', auth, wrap((req, res) => res.json({ running: isRunning(uid(req)), runs: listRuns(uid(req)) })));
api.get('/agent/runs/:id', auth, wrap((req, res) => { const r = getRun(uid(req), Number(req.params.id)); r ? res.json(r) : res.status(404).json({ error: 'Run not found' }); }));
api.get('/agent/activity', auth, wrap((req, res) => res.json(recentActivity(uid(req), Number(req.query.limit) || 200, req.query.runId ? Number(req.query.runId) : undefined))));
api.get('/agent/stream', requireAuth(true), (req, res) => {
  const userId = uid(req);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: ready\ndata: {"running":${isRunning(userId)}}\n\n`);
  const fn = (evt: any) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  bus.on(`user:${userId}`, fn);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); bus.off(`user:${userId}`, fn); });
});

// ---------- jobs ----------
api.post('/jobs/search', auth, wrap((req, res) => {
  const b = z.object({ keywords: z.array(z.string().max(80)).max(8).optional(), goal: z.string().max(1000).optional() }).parse(req.body);
  const goal = b.goal || `Find ${(b.keywords || ['software engineer']).join(', ')} jobs matching my profile`;
  res.status(202).json({ runId: startRun(uid(req), goal) });
}));
api.get('/jobs/providers/status', auth, wrap(async (req, res) => {
  const connectors = await connectorStates(uid(req));
  res.json({ connectors: connectors.map(({ source, label, status, message, enabled, hasCredentials }) => ({ source, label, status, message, enabled, hasCredentials })),
    adzunaCountry: config.adzuna.country.toUpperCase(), adzunaConfigured: !!(config.adzuna.appId && config.adzuna.appKey) });
}));
api.get('/jobs', auth, wrap((req, res) => {
  const q = req.query as any; const n = (v: any) => (v === undefined || v === '' ? undefined : Number(v));
  res.json(listJobs(uid(req), { minMatch: n(q.minMatch), company: q.company, role: q.role, location: q.location, workMode: q.workMode, type: q.type, source: q.source, experience: q.experience, postedWithinDays: n(q.postedWithinDays), sort: q.sort, eligibility: q.eligibility, limit: n(q.limit), offset: n(q.offset), q: q.q }));
}));
api.get('/jobs/:id', auth, wrap((req, res) => {
  const job = getJob(uid(req), Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const c = getConnector(job.source);
  res.json({ ...job, applicationRequirements: c?.getApplicationRequirements(job as any) ?? null, sourceLabel: c?.info.label ?? job.source });
}));

// ---------- applications ----------
api.post('/applications/prepare', auth, wrap(async (req, res) => {
  const { jobId, jobIds } = z.object({ jobId: z.number().int().optional(), jobIds: z.array(z.number().int()).max(25).optional() }).parse(req.body);
  const ids = jobIds || (jobId ? [jobId] : []);
  if (!ids.length) return res.status(400).json({ error: 'jobId or jobIds required' });
  const out: Array<{ id: number; created: boolean }> = [];
  for (const id of ids) out.push(await apps.prepareApplication(uid(req), id));
  res.status(201).json({ applications: out });
}));
api.get('/applications', auth, wrap((req, res) => res.json(apps.listApplications(uid(req), req.query.status as string | undefined))));
api.get('/applications/:id', auth, wrap((req, res) => { const a = apps.getApplication(uid(req), Number(req.params.id)); a ? res.json(a) : res.status(404).json({ error: 'Application not found' }); }));
api.put('/applications/:id', auth, wrap((req, res) => {
  const b = z.object({ coverLetter: z.string().max(8000).optional(), answers: z.array(z.object({ id: z.number().int(), answer: z.string().max(4000) })).optional() }).parse(req.body);
  apps.updateApplicationContent(uid(req), Number(req.params.id), b);
  res.json(apps.getApplication(uid(req), Number(req.params.id)));
}));
api.post('/applications/:id/approve', auth, wrap((req, res) => { apps.approve(uid(req), Number(req.params.id)); res.json(apps.getApplication(uid(req), Number(req.params.id))); }));
api.post('/applications/approve-many', auth, wrap((req, res) => {
  const { ids } = z.object({ ids: z.array(z.number().int()).min(1).max(50) }).parse(req.body);
  const results = ids.map((id) => { try { apps.approve(uid(req), id); return { id, ok: true }; } catch (e: any) { return { id, ok: false, error: e.message }; } });
  res.json({ results });
}));
api.post('/applications/:id/reject', auth, wrap((req, res) => { apps.reject(uid(req), Number(req.params.id)); res.json(apps.getApplication(uid(req), Number(req.params.id))); }));
api.post('/applications/:id/execute', auth, wrap(async (req, res) => {
  const { confirmSubmit } = z.object({ confirmSubmit: z.boolean().optional() }).parse(req.body || {});
  const outcome = await new ApplicationExecutor(uid(req)).execute(Number(req.params.id), { confirmSubmit });
  res.json({ outcome, application: apps.getApplication(uid(req), Number(req.params.id)) });
}));
api.post('/applications/:id/mark-submitted', auth, wrap((req, res) => { new ApplicationExecutor(uid(req)).markSubmitted(Number(req.params.id)); res.json(apps.getApplication(uid(req), Number(req.params.id))); }));
api.post('/applications/:id/status', auth, wrap((req, res) => {
  const { status, note } = z.object({ status: z.enum(['Under Review', 'Interview', 'Offer', 'Rejected', 'Withdrawn']), note: z.string().max(300).optional() }).parse(req.body);
  const a = apps.getApplication(uid(req), Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Application not found' });
  if (!['Submitted', 'Under Review', 'Interview', 'Offer'].includes(a.status) && status !== 'Withdrawn') return res.status(409).json({ error: 'Only submitted applications can move to this status' });
  apps.setStatus(a.id, status, note || `Status updated to ${status} by you`);
  res.json(apps.getApplication(uid(req), a.id));
}));
api.get('/applications/:id/history', auth, wrap((req, res) => {
  const a = apps.getApplication(uid(req), Number(req.params.id));
  a ? res.json(apps.getHistory(a.id)) : res.status(404).json({ error: 'Application not found' });
}));

// ---------- connectors ----------
api.get('/connectors', auth, wrap(async (req, res) => {
  const pw = await playwrightAvailable();
  res.json({ connectors: await connectorStates(uid(req)), ai: aiInfo(), browser: pw, demoMode: config.demoMode });
}));
api.post('/connectors/:source/connect', auth, wrap(async (req, res) => {
  const b = z.object({ enabled: z.boolean().optional(), credentials: z.record(z.string().max(500)).nullable().optional() }).parse(req.body || {});
  if (!getConnector(req.params.source)) return res.status(404).json({ error: 'Unknown connector' });
  setConnector(uid(req), req.params.source, { enabled: b.enabled, credentials: b.credentials });
  res.json((await connectorStates(uid(req))).find((c) => c.source === req.params.source));
}));

// ---------- stats ----------
api.get('/stats', auth, wrap((req, res) => {
  const u = uid(req); const c = (sql: string, ...a: any[]) => (db.prepare(sql).get(...a) as any).c;
  res.json({
    jobsFound: c('SELECT COUNT(*) c FROM jobs WHERE user_id=?', u),
    matchingJobs: c("SELECT COUNT(*) c FROM job_matches WHERE user_id=? AND score>=70 AND eligibility!='Not Eligible'", u),
    awaitingApproval: c("SELECT COUNT(*) c FROM applications WHERE user_id=? AND status='Awaiting Approval'", u),
    submitted: c("SELECT COUNT(*) c FROM applications WHERE user_id=? AND status IN ('Submitted','Under Review','Interview','Offer')", u),
  });
}));

// ---------- MCP (JSON-RPC 2.0 over HTTP) ----------
export const mcp = Router();
mcp.post('/', auth, wrap(async (req, res) => {
  const { id, method, params } = req.body || {};
  const ok = (result: any) => res.json({ jsonrpc: '2.0', id, result });
  try {
    if (method === 'initialize') return ok({ protocolVersion: '2024-11-05', serverInfo: { name: 'hyrd', version: '1.0.0' }, capabilities: { tools: {} } });
    if (method === 'tools/list') return ok({ tools: toolList() });
    if (method === 'tools/call') { const out = await callTool({ userId: uid(req) }, params?.name, params?.arguments); return ok({ content: [{ type: 'text', text: JSON.stringify(out) }] }); }
    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  } catch (e: any) { return res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: e.message } }); }
}));
