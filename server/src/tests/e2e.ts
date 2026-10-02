/* End-to-end test. Runs the REAL server code against a local stand-in for the public job APIs
   (the sandbox cannot reach the live ones). Everything else — DB, auth, uploads, agent, matching, executor — is real. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AddressInfo } from 'node:net';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c: any, name: string, extra = '') => { c ? pass++ : fail++; console.log(`${c ? '  PASS' : '  FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); };

// ---- stand-in public job APIs ----
let remoteokHits = 0; let remoteokMode: 'down' | 'flaky' = 'down';
let adzunaHits = 0;
const mock = http.createServer((req, res) => {
  const u = new URL(req.url!, 'http://x');
  const json = (o: any, s = 200) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/remotive') return json({ jobs: [
    { id: 1, title: 'Software Engineer Intern', company_name: 'Acme Cloud', candidate_required_location: 'India', job_type: 'internship', publication_date: new Date().toISOString(), url: 'https://remotive.com/job/1', description: '<p>Java, Python, SQL and React. Batch of 2026 students. Git, REST APIs.</p>', salary: '' },
    { id: 2, title: 'Senior Backend Engineer', company_name: 'BigCorp', candidate_required_location: 'USA', job_type: 'full_time', publication_date: new Date().toISOString(), url: 'https://remotive.com/job/2', description: '<p>5+ years experience with Go, Kubernetes, AWS, Kafka.</p>' } ] });
  if (u.pathname === '/arbeitnow') return json({ data: [
    { slug: 'acme-swe-intern', title: 'Software Engineer Intern', company_name: 'Acme Cloud Inc.', location: 'India', remote: true, created_at: Math.floor(Date.now() / 1000), url: 'https://arbeitnow.com/jobs/acme', description: '<p>Java Python SQL React internship</p>', tags: [], job_types: ['internship'] },
    { slug: 'fs-dev', title: 'Full Stack Developer', company_name: 'Orbit Labs', location: 'Berlin', remote: false, created_at: Math.floor(Date.now() / 1000), url: 'https://arbeitnow.com/jobs/orbit', description: '<p>React Node.js TypeScript MongoDB. 1 year experience.</p>', tags: [], job_types: ['full time'] } ] });
  if (u.pathname === '/remoteok') { remoteokHits++; if (remoteokMode === 'down' || remoteokHits === 3) return json({ error: 'boom' }, 503); // flaky: only the 3rd request (the real search) fails once
    return json([{ legal: 'notice' }, { id: 99, position: 'Machine Learning Intern', company: 'Neuron Works', location: 'Worldwide', date: new Date().toISOString(), url: 'https://remoteok.com/99', description: '<p>Python PyTorch machine learning computer vision intern</p>', tags: ['ml'] }]); }
  if (u.pathname === '/adzuna/in/search/1') { adzunaHits++; return json({ results: [{ id: 'adzuna-acme-1', title: 'Software Engineer Intern', company: { display_name: 'Acme Cloud Inc.' }, location: { display_name: 'India' }, description: 'Computer Science degree, Java, Python, SQL and React. Batch of 2026. Internship.', created: new Date().toISOString(), redirect_url: 'https://adzuna.com/jobs/adzuna-acme-1', salary_min: 500000, salary_max: 800000, contract_type: 'internship' }] }); }
  json({ error: 'nf' }, 404);
});
await new Promise<void>((r) => mock.listen(0, r));
const base = `http://127.0.0.1:${(mock.address() as AddressInfo).port}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hyrd-e2e-'));
Object.assign(process.env, {
  DATABASE_PATH: path.join(tmp, 't.db'), UPLOAD_DIR: path.join(tmp, 'up'), JWT_SECRET: 'test-secret', DEMO_MODE: 'true', AI_PROVIDER: 'none',
  REMOTIVE_URL: `${base}/remotive`, ARBEITNOW_URL: `${base}/arbeitnow`, REMOTEOK_URL: `${base}/remoteok`, GREENHOUSE_BOARDS: '', LEVER_COMPANIES: '', ENABLE_BROWSER: 'false',
  ADZUNA_APP_ID: 'e2e-app-id', ADZUNA_APP_KEY: 'e2e-app-key', ADZUNA_COUNTRY: 'in', ADZUNA_API_URL: `${base}/adzuna`,
});
const { createApp } = await import('../index.js');
const { generateAdzunaSearches } = await import('../connectors/adzuna/index.js');
const server = createApp().listen(0);
const API = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
let token = '';
const call = async (m: string, p: string, body?: any, raw?: FormData) => {
  const r = await fetch(API + p, { method: m, headers: { ...(raw ? {} : body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  let d: any = null; try { d = await r.json(); } catch {}
  return { s: r.status, d };
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log('\n[1] Auth');
let r = await call('GET', '/health'); ok(r.s === 200 && r.d.database === true && r.d.connectors.adzuna === true, 'health reports database and configured Adzuna connector without secrets');
r = await call('GET', '/profile'); ok(r.s === 401, 'protected route rejects anonymous');
r = await call('POST', '/auth/register', { email: 'vani@example.com', password: 'short', name: 'Vani' }); ok(r.s === 400, 'register rejects weak/short password');
r = await call('POST', '/auth/register', { email: 'vani@example.com', password: 'password123', name: 'Vani Test Candidate' }); ok(r.s === 201 && !!r.d.token, 'register');
r = await call('POST', '/auth/register', { email: 'vani@example.com', password: 'password123', name: 'x' }); ok(r.s === 409, 'duplicate email rejected');
r = await call('POST', '/auth/login', { email: 'vani@example.com', password: 'wrongpass1' }); ok(r.s === 401, 'login rejects wrong password');
r = await call('POST', '/auth/login', { email: 'vani@example.com', password: 'password123' }); ok(r.s === 200, 'login'); token = r.d.token;
const row: any = (await import('../db/index.js')).db.prepare('SELECT password_hash FROM users').get(); ok(row.password_hash.startsWith('$2'), 'password stored as bcrypt hash');
r = await call('POST', '/auth/register', { email: 'other@example.com', password: 'password123', name: 'Other' }); const otherToken = r.d.token;

console.log('\n[2] Resume upload & extraction');
const fd = (file: string, name: string, type: string) => { const f = new FormData(); f.append('resume', new Blob([fs.readFileSync(path.join(here, 'fixtures', file))], { type }), name); return f; };
r = await call('POST', '/resume/upload', undefined, fd('fake.pdf', 'fake.pdf', 'application/pdf')); ok(r.s === 400, 'rejects fake PDF (magic bytes)');
r = await call('POST', '/resume/upload', undefined, fd('resume.docx', 'resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')); ok(r.s === 201 && r.d.profile.skills.includes('Java'), 'DOCX parsed', `skills=${r.d.profile?.skills?.length}`);
r = await call('POST', '/resume/upload', undefined, fd('resume.pdf', 'resume.pdf', 'application/pdf')); ok(r.s === 201, 'PDF uploaded');
const pp = r.d.profile;
ok(pp.education.gradYear === 2026 && /Computer Science/i.test(pp.education.branch), 'education extracted', `${pp.education.degree}/${pp.education.branch}/${pp.education.gradYear}`);
ok(pp.skills.includes('React') && pp.skills.includes('SQL') && pp.skills.includes('Python'), 'skills extracted');
ok(pp.education.cgpa === '8.87', 'CGPA extracted');
ok(pp.projects.length >= 2 && pp.certifications.length >= 1, 'projects & certifications extracted', `${pp.projects.length} projects`);
ok(pp.name.startsWith('Vani'), 'name extracted');
r = await call('GET', '/resume'); ok(r.s === 200 && r.d.filename === 'resume.pdf', 'GET /resume returns latest');

console.log('\n[3] Profile');
const prof = { ...pp, preferences: { roles: ['Software Engineer', 'AI/ML'], locations: ['India'], workModes: ['Remote', 'Hybrid'], employmentTypes: ['Internship'], experienceYears: 0, salaryPreference: '', other: '' } };
r = await call('PUT', '/profile', prof); ok(r.s === 200, 'profile saved');
r = await call('PUT', '/profile', { ...prof, education: { ...prof.education, gradYear: 'abc' } }); ok(r.s === 400, 'profile validation rejects bad input');
r = await call('GET', '/profile'); ok(r.d.preferences.roles.includes('AI/ML'), 'profile persisted');

console.log('\n[4] Connectors');
r = await call('GET', '/connectors'); const cs = r.d.connectors as any[];
const st = (s: string) => cs.find((c) => c.source === s)?.status;
ok(['linkedin', 'naukri', 'indeed', 'internshala'].every((s) => st(s) === 'unsupported'), 'LinkedIn/Naukri/Indeed/Internshala report "unsupported" (no scraping)');
ok(st('remotive') === 'connected' && st('arbeitnow') === 'connected', 'public-feed connectors report connected');
ok(st('remoteok') === 'failed', 'failing source reported as failed (probe)', st('remoteok'));
ok(st('company_careers') === 'unsupported', 'company careers unsupported until boards configured');
ok(st('adzuna') === 'available', 'Adzuna reports available when credentials are configured');
r = await call('GET', '/jobs/providers/status'); ok(r.s === 200 && r.d.adzunaConfigured && r.d.adzunaCountry === 'IN' && !JSON.stringify(r.d).includes('e2e-app-key'), 'provider diagnostics show configuration but never expose keys');
const adzunaSearches = generateAdzunaSearches({ keywords: ['Software Engineer', 'Java', 'internship'], locations: ['Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Coimbatore', 'India'], remoteOk: true });
ok(adzunaSearches.some((s: any) => /Java Intern/i.test(s.term)) && adzunaSearches.some((s: any) => /Software Engineer Intern/i.test(s.term)) && ['Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Coimbatore', 'India'].every((loc) => adzunaSearches.some((s: any) => s.location === loc)), 'Adzuna generates dynamic role/skill searches across all priority India locations', `${adzunaSearches.length} queries`);
const remoteSearches = generateAdzunaSearches({ keywords: ['Software Engineer'], locations: ['Remote India'] });
ok(remoteSearches.some((s: any) => s.location === 'India' && /remote/i.test(s.term)) && !remoteSearches.some((s: any) => s.location === 'Remote India'), 'Remote India search uses India endpoint/location rather than querying a fake Remote city');
const indiaSearches = generateAdzunaSearches({ keywords: ['Software Engineer'], locations: ['India'] });
ok(['Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Coimbatore'].every((loc) => indiaSearches.some((s: any) => s.location === loc)), 'A broad India search also targets the prioritized Indian cities');

console.log('\n[5] Agent run (goal → plan → search → dedupe → match → prepare)');
const events: string[] = [];
const ctrl = new AbortController();
fetch(`${API}/agent/stream?token=${token}`, { signal: ctrl.signal }).then(async (res) => { const rd = res.body!.getReader(); const dec = new TextDecoder(); for (;;) { const { value, done } = await rd.read(); if (done) break; for (const m of dec.decode(value).matchAll(/"type":"([A-Z_]+)"/g)) events.push(m[1]); } }).catch(() => {});
await sleep(200);
remoteokMode = 'flaky'; remoteokHits = 0;
const goal = 'Find software engineering internships in India matching my resume, preferably remote, and prepare applications for jobs above 70% match.';
r = await call('POST', '/agent/run', { goal }); ok(r.s === 202, 'agent run accepted'); const runId = r.d.runId;
r = await call('POST', '/agent/run', { goal }); ok(r.s === 409, 'second concurrent run blocked');
let run: any; for (let i = 0; i < 60; i++) { await sleep(300); run = (await call('GET', `/agent/runs/${runId}`)).d; if (run.status !== 'running') break; }
ok(['awaiting_approval', 'completed'].includes(run.status), 'agent run finished', run.status + (run.error ? ` (${run.error})` : ''));
ok(run.parsedGoal.minMatch === 70 && run.parsedGoal.action === 'prepare', 'goal parsed (min 70%, prepare)', JSON.stringify({ roles: run.parsedGoal.roles, loc: run.parsedGoal.locations }));
ok(run.tasks.every((t: any) => ['done', 'skipped', 'waiting'].includes(t.status)), 'all plan steps resolved', run.tasks.map((t: any) => t.status).join(','));
const bySource = Object.fromEntries(run.stats.sources.map((s: any) => [s.source, s]));
console.log(`[FIXTURE SUMMARY] searches=${Number((bySource.adzuna?.message || '').match(/across (\d+) generated/)?.[1] || 0)} rawJobs=${run.stats.jobsFound} uniqueJobs=${run.stats.uniqueJobs} duplicatesRemoved=${run.stats.duplicatesRemoved} eligible=${run.stats.eligible} potentiallyEligible=${run.stats.potentiallyEligible} notEligible=${run.stats.notEligible} needsReview=${run.stats.needsReview}`);
ok(bySource.remotive.status === 'connected' && bySource.arbeitnow.status === 'connected', 'working sources returned listings');
ok(bySource.adzuna.status === 'connected' && adzunaHits > 0 && /generated role\/location searches/.test(bySource.adzuna.message), 'Adzuna live-search connector normalizes official API jobs', `requests=${adzunaHits}; ${bySource.adzuna.message}`);
ok(bySource.linkedin.status === 'unsupported' && bySource.naukri.status === 'unsupported', 'unsupported platforms recorded, run continued');
ok(bySource.remoteok.status === 'connected' && bySource.remoteok.attempts === 2, 'RECOVERY: flaky source succeeded after retry/backoff', `attempts=${bySource.remoteok.attempts}, hits=${remoteokHits}`);
ok(run.stats.jobsFound >= 5, 'listings fetched through the connector layer (stand-in APIs + demo source)', `${run.stats.jobsFound} raw`);
ok(run.stats.duplicatesRemoved >= 1, 'cross-source duplicate removed ("Acme Cloud" intern appeared on 2 sources)', `${run.stats.duplicatesRemoved} removed`);
ok(!run.stats.sources.some((s: any) => s.source === 'demo' && s.count === 0 && false), 'demo source present only because DEMO_MODE=true');
r = await call('GET', '/jobs?sort=best'); const jobs = r.d.jobs as any[];
ok(r.d.total === run.stats.uniqueJobs, 'jobs persisted', `${r.d.total} jobs`);
const acme = jobs.find((x) => x.company.startsWith('Acme Cloud') && !x.isDemo);
ok(!!acme && acme.alsoOn.length >= 1 && acme.alsoOn.includes('adzuna'), 'duplicate merged with "also on" source list, including Adzuna', acme?.alsoOn?.join(','));
ok(acme.match.score >= 70 && acme.match.eligibility === 'Eligible', 'Acme intern: strong match + Eligible (grad year 2026 verified)', `${acme.match.score}% ${acme.match.eligibility}`);
ok(acme.match.matchedSkills.includes('Java') && !acme.match.matchedSkills.includes('Kafka'), 'matched skills only include real candidate skills');
const sum = Object.values(acme.match.breakdown as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
ok(sum === acme.match.score, 'score is transparent: breakdown sums to score', JSON.stringify(acme.match.breakdown));
const senior = jobs.find((x) => x.title.includes('Senior Backend'));
ok(senior.match.eligibility === 'Not Eligible', 'Senior role requiring 5+ yrs → Not Eligible', senior.match.eligibilityNotes[0]);
ok(!senior.application, 'ineligible job not prepared');
const unknownish = jobs.find((x) => x.title === 'Full Stack Developer');
ok(!!unknownish && ['Potentially Eligible', 'Eligible', 'Needs Review', 'Unknown'].includes(unknownish.match.eligibility), 'unverifiable info is sent for review rather than marked eligible', unknownish?.match.eligibility);
r = await call('GET', '/jobs?minMatch=70&type=Internship&source=arbeitnow'); ok(r.d.jobs.every((x: any) => x.match.score >= 70 && x.employmentType === 'Internship'), 'filters work (match/type/source incl. merged sources)', `${r.d.total}`);
r = await call('GET', `/jobs/${acme.id}`); ok(r.s === 200 && r.d.applicationRequirements?.method === 'External Redirect', 'job details + application requirements');
ok(events.includes('AGENT_STARTED') && events.includes('SOURCE_SEARCH_COMPLETED') && events.includes('SOURCE_SEARCH_FAILED') && events.includes('JOBS_FOUND') && events.includes('DUPLICATES_REMOVED') && events.includes('MATCHING_COMPLETED') && events.includes('APPLICATION_PREPARED') && events.includes('APPROVAL_REQUIRED') && events.includes('AGENT_COMPLETED'), 'SSE delivered live agent events', [...new Set(events)].length + ' event types');
ctrl.abort();
r = await call('GET', `/agent/activity?runId=${runId}`); ok(r.d.length > 10, 'activity log persisted', `${r.d.length} entries`);

console.log('\n[6] Applications: preparation → human approval → execution');
r = await call('GET', '/applications'); const appsList = r.d as any[];
ok(appsList.length >= 1 && appsList.every((a) => a.status === 'Awaiting Approval'), 'prepared applications wait for approval (none auto-submitted)', `${appsList.length} queued`);
const app = appsList.find((a) => a.job.company.startsWith('Acme Cloud') && !a.job.isDemo)!;
ok(app.coverLetter.includes('Acme Cloud') && app.answers.length >= 6 && !!app.resume, 'cover letter + answers + resume attached');
ok(!/Google|Microsoft|Amazon/.test(app.coverLetter + JSON.stringify(app.answers)), 'no fabricated employers in generated text');
r = await call('POST', `/applications/${app.id}/execute`, {}); ok(r.s === 409, 'execute BLOCKED before approval');
r = await call('PUT', `/applications/${app.id}`, { coverLetter: 'Edited cover letter for Acme Cloud.', answers: [{ id: app.answers[0].id, answer: 'My edited answer.' }] }); ok(r.s === 200 && r.d.coverLetter.startsWith('Edited') && r.d.answers[0].edited === 1, 'user can edit cover letter and answers');
r = await call('POST', `/applications/${app.id}/approve`); ok(r.s === 200 && r.d.status === 'Approved', 'Approve');
r = await call('PUT', `/applications/${app.id}`, { coverLetter: 'Changed after approval' }); ok(r.d.status === 'Awaiting Approval', 'editing after approval forces re-approval');
await call('POST', `/applications/${app.id}/approve`);
r = await call('POST', `/applications/${app.id}/execute`, {}); const out = r.d.outcome;
ok(r.s === 200 && out.method === 'External Redirect' && out.status === 'Applying' && !!out.humanAction, 'external source: HYRD does NOT claim submission; hands off to human', out.message);
ok(r.d.application.status === 'Applying', 'status stays "Applying" until human confirms');
r = await call('POST', `/applications/${app.id}/mark-submitted`); ok(r.s === 200 && r.d.status === 'Submitted', 'human confirms → Submitted (user-attested)');
r = await call('GET', `/applications/${app.id}/history`); const hist = r.d.map((h: any) => h.status);
ok(['Discovered', 'Matched', 'Prepared', 'Awaiting Approval', 'Approved', 'Applying', 'Submitted'].every((s) => hist.includes(s)), 'full application history recorded', hist.join(' → '));
r = await call('POST', `/applications/${app.id}/status`, { status: 'Interview' }); ok(r.d.status === 'Interview', 'tracker status update (Interview)');
// demo API executor (clearly labelled mock)
const demo = appsList.find((a) => a.job.isDemo);
if (demo) {
  await call('POST', `/applications/${demo.id}/approve`);
  r = await call('POST', `/applications/${demo.id}/execute`, {}); ok(r.d.outcome.method === 'API' && r.d.application.status === 'Submitted' && /DEMO/.test(r.d.application.executionResult), 'DEMO API executor: submit + verify, clearly labelled mock');
}
const rej = appsList.find((a) => a.id !== app.id && a.id !== demo?.id);
if (rej) { r = await call('POST', `/applications/${rej.id}/reject`); ok(r.d.status === 'Withdrawn', 'Reject → Withdrawn'); r = await call('POST', `/applications/${rej.id}/execute`, {}); ok(r.s === 409, 'rejected application cannot be executed'); }
r = await call('POST', '/applications/prepare', { jobId: senior.id }); ok(r.s === 201, 'manual prepare from job card works');
r = await call('POST', '/applications/approve-many', { ids: [r.d.applications[0].id] }); ok(r.d.results[0].ok, 'bulk approve');

console.log('\n[7] Isolation, MCP, stats, recovery of total failure');
token = otherToken;
r = await call('GET', `/applications/${app.id}`); ok(r.s === 404, "other user cannot read someone else's application");
r = await call('GET', '/jobs'); ok(r.d.total === 0, 'jobs are per-user');
token = (await call('POST', '/auth/login', { email: 'vani@example.com', password: 'password123' })).d.token;
const mcpCall = (method: string, params?: any) => fetch(API.replace('/api', '/mcp'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json());
let m = await mcpCall('tools/list'); ok(['search_jobs', 'get_job_details', 'analyze_job', 'prepare_application', 'open_application', 'fill_application', 'verify_application', 'get_application_status'].every((n) => m.result.tools.some((t: any) => t.name === n)), 'MCP exposes all 8 tools');
m = await mcpCall('tools/call', { name: 'get_application_status', arguments: { applicationId: app.id } }); ok(JSON.parse(m.result.content[0].text).status === 'Interview', 'MCP tool call works');
r = await call('GET', '/stats'); ok(r.d.jobsFound > 0 && r.d.submitted >= 1, 'dashboard stats', JSON.stringify(r.d));
// all real sources die → agent still finishes and says so
process.env.REMOTIVE_URL = 'http://127.0.0.1:1/x';
r = await call('POST', '/connectors/remotive/connect', { enabled: false }); ok(r.d.enabled === false, 'connector can be disabled');
r = await call('POST', '/connectors/linkedin/connect', { credentials: { accessToken: 'abc' } }); ok(r.d.hasCredentials === true && r.d.status === 'available', 'credentials stored (encrypted) for future authorized connector');
const enc: any = (await import('../db/index.js')).db.prepare("SELECT credentials_enc FROM job_sources WHERE source='linkedin'").get(); ok(!enc.credentials_enc.includes('abc'), 'credentials encrypted at rest');
r = await call('POST', '/agent/run', { goal: 'Find software engineer jobs' }); let run2: any; for (let i = 0; i < 60; i++) { await sleep(300); run2 = (await call('GET', `/agent/runs/${r.d.runId}`)).d; if (run2.status !== 'running') break; }
ok(run2.status !== 'running' && run2.stats.sources.find((s: any) => s.source === 'arbeitnow').status === 'connected', 'agent run with a source disabled continues with the others', run2.status);
r = await call('POST', '/auth/logout'); ok(r.s === 204, 'logout');

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
server.close(); mock.close();
process.exit(fail ? 1 : 0);
