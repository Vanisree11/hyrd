import { BaseConnector, inferEmployment, inferExperience, inferWorkMode, relevant } from '../base.js';
import type { ConnectorContext, NormalizedJob, SearchQuery } from '../types.js';
import { ConnectorError } from '../types.js';
import { fetchJson, HttpError } from '../../utils/http.js';
import { stripHtml } from '../../utils/skills.js';
import { config } from '../../config.js';

function mapErr(e: any): never {
  if (e instanceof HttpError) {
    if (e.status === 429) throw new ConnectorError('rate_limited', e.message, true);
    if (e.status === 401 || e.status === 403) throw new ConnectorError('authentication_required', e.message, false);
    throw new ConnectorError('failed', e.message, e.retryable);
  }
  throw e;
}
const probe = async (url: string) => {
  try { await fetchJson(url, {}, 8000); return { status: 'connected' as const, message: 'Official public API reachable' }; }
  catch (e: any) {
    if (e instanceof HttpError && e.status === 429) return { status: 'rate_limited' as const, message: e.message };
    return { status: 'failed' as const, message: e.message || 'unreachable' };
  }
};

/** Remotive — official public API (remote jobs). Attribution: remotive.com */
export class RemotiveConnector extends BaseConnector {
  info = { source: 'remotive', label: 'Remotive', kind: 'public-feed' as const, description: 'Remote job listings via Remotive\'s public API.', officialUrl: 'https://remotive.com', policy: 'Public API; links back to remotive.com for applying.' };
  checkStatus() { return probe(`${config.publicFeedBase.remotive}?limit=1`); }
  async searchJobs(q: SearchQuery): Promise<NormalizedJob[]> {
    const terms = q.keywords.length ? q.keywords.slice(0, 3) : ['software'];
    const out: NormalizedJob[] = [];
    for (const term of terms) {
      let data: any;
      try { data = await fetchJson(`${config.publicFeedBase.remotive}?search=${encodeURIComponent(term)}&limit=50`); } catch (e) { mapErr(e); }
      for (const r of data.jobs || []) {
        const description = stripHtml(r.description || '');
        out.push(this.finish({
          source: 'remotive', sourceJobId: String(r.id), title: r.title, company: r.company_name,
          location: r.candidate_required_location || 'Worldwide', workMode: 'Remote', description,
          skills: (r.tags || []).length ? undefined : undefined, experience: inferExperience(description),
          salary: r.salary || null, employmentType: inferEmployment(`${r.job_type || ''} ${r.title}`),
          postedDate: r.publication_date || null, applicationUrl: r.url, applicationMethod: 'External Redirect',
          sourceMetadata: { category: r.category, tags: r.tags },
        }));
      }
    }
    return out;
  }
}

/** Arbeitnow — public job board API. */
export class ArbeitnowConnector extends BaseConnector {
  info = { source: 'arbeitnow', label: 'Arbeitnow', kind: 'public-feed' as const, description: 'Job board API (mostly Europe, many remote/visa-friendly roles).', officialUrl: 'https://www.arbeitnow.com', policy: 'Public API; links back to arbeitnow.com for applying.' };
  checkStatus() { return probe(config.publicFeedBase.arbeitnow); }
  async searchJobs(q: SearchQuery): Promise<NormalizedJob[]> {
    const out: NormalizedJob[] = [];
    for (let page = 1; page <= 3; page++) {
      let data: any;
      try { data = await fetchJson(`${config.publicFeedBase.arbeitnow}?page=${page}`); } catch (e) { if (page === 1) mapErr(e); break; }
      for (const r of data.data || []) {
        const description = stripHtml(r.description || '');
        const job = this.finish({
          source: 'arbeitnow', sourceJobId: String(r.slug), title: r.title, company: r.company_name,
          location: r.location || 'Unknown', workMode: r.remote ? 'Remote' : inferWorkMode(description), description, experience: inferExperience(description),
          salary: null, employmentType: inferEmployment(`${(r.job_types || []).join(' ')} ${r.title}`),
          postedDate: r.created_at ? new Date(r.created_at * 1000).toISOString() : null, applicationUrl: r.url, applicationMethod: 'External Redirect',
          sourceMetadata: { tags: r.tags, job_types: r.job_types },
        });
        if (relevant(job, q.keywords)) out.push(job);
      }
    }
    return out;
  }
}

/** RemoteOK — public JSON feed (requires attribution/link back; first element is a legal notice). */
export class RemoteOkConnector extends BaseConnector {
  info = { source: 'remoteok', label: 'RemoteOK', kind: 'public-feed' as const, description: 'Remote jobs from RemoteOK\'s public feed.', officialUrl: 'https://remoteok.com', policy: 'Public feed; every job links back to remoteok.com as required.' };
  checkStatus() { return probe(config.publicFeedBase.remoteok); }
  async searchJobs(q: SearchQuery): Promise<NormalizedJob[]> {
    let data: any;
    try { data = await fetchJson(config.publicFeedBase.remoteok); } catch (e) { mapErr(e); }
    const out: NormalizedJob[] = [];
    for (const r of (data || []).filter((x: any) => x && x.id && x.position)) {
      const description = stripHtml(r.description || '');
      const job = this.finish({
        source: 'remoteok', sourceJobId: String(r.id), title: r.position, company: r.company, location: r.location || 'Worldwide', workMode: 'Remote',
        description, skills: undefined, experience: inferExperience(description),
        salary: r.salary_min ? `$${r.salary_min}-${r.salary_max}` : null, employmentType: inferEmployment(r.position),
        postedDate: r.date || null, applicationUrl: r.url || r.apply_url, applicationMethod: 'External Redirect', sourceMetadata: { tags: r.tags },
      });
      if (relevant(job, q.keywords)) out.push(job);
    }
    return out;
  }
}
