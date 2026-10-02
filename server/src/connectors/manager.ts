import { db, j, parse } from '../db/index.js';
import { config } from '../config.js';
import { decrypt, encrypt } from '../utils/crypto.js';
import { withRetry } from '../utils/http.js';
import type { ConnectorContext, ConnectorStatus, JobSourceConnector, NormalizedJob, SearchQuery } from './types.js';
import { ConnectorError } from './types.js';
import { RemotiveConnector, ArbeitnowConnector, RemoteOkConnector } from './publicFeeds/index.js';
import { CompanyCareersConnector } from './companyCareers/index.js';
import { LinkedInConnector } from './linkedin/index.js';
import { NaukriConnector } from './naukri/index.js';
import { IndeedConnector } from './indeed/index.js';
import { InternshalaConnector } from './internshala/index.js';
import { DemoConnector } from './demo/index.js';
import { AdzunaConnector, generateAdzunaSearches } from './adzuna/index.js';

const registry: JobSourceConnector[] = [
  new RemotiveConnector(), new ArbeitnowConnector(), new RemoteOkConnector(), new CompanyCareersConnector(),
  new AdzunaConnector(), new LinkedInConnector(), new NaukriConnector(), new IndeedConnector(), new InternshalaConnector(), new DemoConnector(),
];
export const getConnector = (source: string) => registry.find((c) => c.info.source === source);
export const listConnectors = () => registry.filter((c) => c.info.source !== 'demo' || config.demoMode);

function row(userId: number, source: string): any {
  return db.prepare('SELECT * FROM job_sources WHERE user_id=? AND source=?').get(userId, source);
}
const defaultEnabled = (_c: JobSourceConnector) => true;

export function isEnabled(userId: number, c: JobSourceConnector): boolean {
  const r = row(userId, c.info.source);
  return r ? !!r.enabled : defaultEnabled(c);
}
export function getCredentials(userId: number, source: string): Record<string, string> | null {
  const r = row(userId, source);
  if (!r?.credentials_enc) return null;
  try { return JSON.parse(decrypt(r.credentials_enc)); } catch { return null; }
}
export function setConnector(userId: number, source: string, patch: { enabled?: boolean; credentials?: Record<string, string> | null }) {
  const cur = row(userId, source);
  const enabled = patch.enabled ?? (cur ? !!cur.enabled : true);
  const enc = patch.credentials === undefined ? cur?.credentials_enc ?? null : patch.credentials ? encrypt(JSON.stringify(patch.credentials)) : null;
  db.prepare(`INSERT INTO job_sources (user_id, source, enabled, credentials_enc) VALUES (?,?,?,?)
    ON CONFLICT(user_id, source) DO UPDATE SET enabled=excluded.enabled, credentials_enc=excluded.credentials_enc`).run(userId, source, enabled ? 1 : 0, enc);
}
function recordStatus(userId: number, source: string, status: string, message: string) {
  db.prepare(`INSERT INTO job_sources (user_id, source, enabled, last_status, last_message, last_checked_at) VALUES (?,?,?,?,?,datetime('now'))
    ON CONFLICT(user_id, source) DO UPDATE SET last_status=excluded.last_status, last_message=excluded.last_message, last_checked_at=excluded.last_checked_at`)
    .run(userId, source, defaultEnabled(getConnector(source)!) ? 1 : 0, status, message);
}

export async function connectorStates(userId: number) {
  return Promise.all(listConnectors().map(async (c) => {
    const ctx: ConnectorContext = { userId, credentials: getCredentials(userId, c.info.source) };
    let s: { status: ConnectorStatus; message: string };
    try { s = await c.checkStatus(ctx); } catch (e: any) { s = { status: 'failed', message: e.message }; }
    recordStatus(userId, c.info.source, s.status, s.message);
    return { ...c.info, enabled: isEnabled(userId, c), status: s.status, message: s.message, hasCredentials: !!getCredentials(userId, c.info.source) };
  }));
}

export interface SourceResult { source: string; label: string; status: ConnectorStatus; jobs: NormalizedJob[]; attempts: number; message: string; durationMs: number }
export interface SearchHooks {
  onStart?: (c: JobSourceConnector) => void;
  onDone?: (r: SourceResult) => void;
}

/** Search every enabled connector in parallel; one failing source never aborts the others. */
export async function searchAll(userId: number, runId: number | null, q: SearchQuery, hooks: SearchHooks = {}): Promise<SourceResult[]> {
  const targets = listConnectors().filter((c) => isEnabled(userId, c));
  return Promise.all(targets.map(async (c): Promise<SourceResult> => {
    const t0 = Date.now();
    hooks.onStart?.(c);
    const ctx: ConnectorContext = { userId, credentials: getCredentials(userId, c.info.source) };
    let res: SourceResult;
    try {
      const st = await c.checkStatus(ctx).catch((e) => ({ status: 'failed' as ConnectorStatus, message: e.message }));
      if (st.status === 'unsupported' || st.status === 'authentication_required') {
        res = { source: c.info.source, label: c.info.label, status: st.status, jobs: [], attempts: 0, message: st.message, durationMs: Date.now() - t0 };
      } else {
        const { value, attempts } = await withRetry(() => c.searchJobs(q, ctx), { retries: 1, baseMs: 600 });
        const searchCount = c.info.source === 'adzuna' ? ` across ${generateAdzunaSearches(q).length} generated role/location searches` : '';
        const diagnostics = value.find((job) => job.sourceMetadata?.searchDiagnostics)?.sourceMetadata.searchDiagnostics;
        const partialErrors = diagnostics?.errors?.length ? `; ${diagnostics.errors.length} search request(s) failed: ${diagnostics.errors.slice(0, 2).join('; ')}` : '';
        res = { source: c.info.source, label: c.info.label, status: value.length ? 'connected' : 'no_results', jobs: value, attempts, message: `${value.length ? `${value.length} listings fetched` : 'No listings matched this search'}${searchCount}${partialErrors}`, durationMs: Date.now() - t0 };
      }
    } catch (e: any) {
      const status: ConnectorStatus = e instanceof ConnectorError ? e.status : 'failed';
      res = { source: c.info.source, label: c.info.label, status, jobs: [], attempts: e.attempts || 1, message: e.message || 'failed', durationMs: Date.now() - t0 };
    }
    db.prepare('INSERT INTO connector_runs (run_id, user_id, source, status, jobs_found, attempts, message, duration_ms) VALUES (?,?,?,?,?,?,?,?)')
      .run(runId, userId, res.source, res.status, res.jobs.length, res.attempts, res.message, res.durationMs);
    recordStatus(userId, res.source, res.status, res.message);
    hooks.onDone?.(res);
    return res;
  }));
}
