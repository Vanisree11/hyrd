import { BaseConnector, inferEmployment, inferExperience, inferWorkMode } from '../base.js';
import type { ConnectorContext, NormalizedJob, SearchQuery } from '../types.js';
import { ConnectorError } from '../types.js';
import { fetchJson, HttpError } from '../../utils/http.js';
import { stripHtml } from '../../utils/skills.js';
import { config } from '../../config.js';

const INDIA_LOCATIONS = ['Chennai', 'Bengaluru', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi NCR', 'Coimbatore', 'India'];
const MAX_SEARCHES = 32;
const TECH_SKILLS = /^(java|javascript|typescript|python|c\+\+|c#|go|rust|kotlin|sql|react|angular|vue|node\.?js|spring|\.net|aws|azure|machine learning|ai\/ml)$/i;
const ROLE_TERMS = /software|engineer|developer|intern|graduate|fresher|trainee|analyst|scientist|\bsde\b|\bswe\b|devops|front[ -]?end|back[ -]?end|full[ -]?stack|programmer|technology/i;
const unique = (values: string[]) => [...new Map(values.map((v) => [v.toLowerCase().trim(), v.trim()])).values()].filter(Boolean);

/** Make targeted title variants from the candidate's requested roles and actual resume skills. */
export function generateAdzunaSearchTerms(keywords: string[]): string[] {
  const raw = unique(keywords).slice(0, 20);
  const wantsInternship = raw.some((x) => /intern|graduate|fresher|trainee/i.test(x));
  const roleInputs = raw.filter((x) => ROLE_TERMS.test(x) && !/^intern(ship)?$/i.test(x));
  const skills = raw.filter((x) => TECH_SKILLS.test(x));
  const terms: string[] = [];
  const add = (term: string) => { if (term && !terms.some((x) => x.toLowerCase() === term.toLowerCase())) terms.push(term); };

  for (const role of roleInputs) {
    add(role);
    if (/software|\bsde\b|\bswe\b/i.test(role)) {
      add('Software Engineer'); add('Software Developer'); add('Graduate Software Engineer');
      add('Associate Software Engineer');
      if (wantsInternship) add('Software Engineer Intern');
      if (skills.includes('React') && skills.some((s) => /node\.?js|java|python/i.test(s))) add('Full Stack Developer');
      if (wantsInternship && skills.includes('Java')) add('Java Developer');
      if (wantsInternship) add('Technology Analyst');
    } else if (/full[ -]?stack/i.test(role)) add('Full Stack Developer');
    else if (/front[ -]?end|ui developer/i.test(role)) add('Frontend Developer');
    else if (/back[ -]?end/i.test(role)) add('Backend Developer');
    else if (/ai|machine learning|\bml\b/i.test(role)) { add('AI/ML Engineer'); add('Machine Learning Intern'); }
    else if (/data analyst/i.test(role)) add('Data Analyst');
    else if (/technology analyst/i.test(role)) add('Technology Analyst');
  }
  for (const skill of skills) {
    if (terms.length >= 10) break;
    add(`${skill} Developer`);
    if (wantsInternship && terms.length < 10) add(`${skill} Intern`);
  }
  return terms.slice(0, 10);
}

export function generateAdzunaSearches(q: SearchQuery): Array<{ term: string; location: string }> {
  const terms = generateAdzunaSearchTerms(q.keywords);
  if (!terms.length) terms.push('software engineer');
  const remoteRequested = q.remoteOnly || q.remoteOk || q.locations.some((x) => /remote/i.test(x));
  const locations = unique((q.locations.length ? q.locations : INDIA_LOCATIONS).map((x) => /remote/i.test(x) ? 'India' : x));
  const searches: Array<{ term: string; location: string }> = [];
  const add = (term: string, location: string) => {
    if (searches.length >= MAX_SEARCHES) return;
    if (!searches.some((x) => x.term.toLowerCase() === term.toLowerCase() && x.location.toLowerCase() === location.toLowerCase())) searches.push({ term, location });
  };

  // Always search each resume-derived role across India. Then use the user's chosen
  // locations (or city defaults) for the leading role terms within the request budget.
  const national = locations.some((x) => /^india$/i.test(x)) ? 'India' : 'India';
  for (const term of terms) add(term, national);
  let targetedLocations = locations.filter((x) => !/^india$/i.test(x));
  if (!targetedLocations.length && !q.remoteOnly) targetedLocations = INDIA_LOCATIONS.filter((x) => !/^india$/i.test(x));
  const focusTerms = terms.slice(0, Math.min(3, terms.length));
  for (const location of targetedLocations) for (const term of focusTerms) add(term, location);
  if (remoteRequested) add(`${terms[0]} remote`, 'India');
  return searches;
}

function classify(e: any): ConnectorError {
  if (e instanceof HttpError) {
    if (e.status === 401 || e.status === 403) return new ConnectorError('authentication_required', `Adzuna authentication failed (HTTP ${e.status}). Check ADZUNA_APP_ID and ADZUNA_APP_KEY.`, false);
    if (e.status === 429) return new ConnectorError('rate_limited', 'Adzuna rate limit reached. Wait before searching again.', false);
    return new ConnectorError('failed', `Adzuna request failed${e.status ? ` (HTTP ${e.status})` : ''}: ${e.message}`, e.retryable);
  }
  return new ConnectorError('failed', `Adzuna request failed: ${e?.message || 'unknown error'}`, true);
}

function salary(min: unknown, max: unknown): string | null {
  const a = min == null ? Number.NaN : Number(min), b = max == null ? Number.NaN : Number(max);
  if (!Number.isFinite(a) && !Number.isFinite(b)) return null;
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
  return Number.isFinite(a) && Number.isFinite(b) ? `${fmt(a)}–${fmt(b)}/year` : `${fmt(Number.isFinite(a) ? a : b)}/year`;
}

/** Official Adzuna search API. Credentials remain server-side and are never logged. */
export class AdzunaConnector extends BaseConnector {
  info = { source: 'adzuna', label: 'Adzuna', kind: 'public-feed' as const,
    description: 'Live job advertisements through Adzuna’s official Jobs API, with India-first location searches.',
    officialUrl: 'https://developer.adzuna.com/docs/search',
    policy: 'Uses the official Adzuna Jobs API. Application links redirect to the listing/provider.' };

  async checkStatus() {
    if (!config.adzuna.appId || !config.adzuna.appKey) return { status: 'authentication_required' as const, message: 'Adzuna is not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to the project .env file.' };
    return { status: 'available' as const, message: `Adzuna credentials configured (country: ${config.adzuna.country.toUpperCase()}).` };
  }

  async searchJobs(q: SearchQuery, _ctx: ConnectorContext): Promise<NormalizedJob[]> {
    if (!config.adzuna.appId || !config.adzuna.appKey) throw new ConnectorError('authentication_required', 'Adzuna is not configured. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to the project .env file.', false);
    const searches = generateAdzunaSearches(q);
    const jobs = new Map<string, NormalizedJob>();
    const errors: any[] = [];
    let next = 0;
    let stop = false;
    const worker = async () => {
      while (!stop) {
        const index = next++;
        if (index >= searches.length) return;
        const search = searches[index];
        const url = new URL(`${config.adzuna.baseUrl}/${config.adzuna.country}/search/1`);
        url.searchParams.set('app_id', config.adzuna.appId);
        url.searchParams.set('app_key', config.adzuna.appKey);
        url.searchParams.set('results_per_page', '20');
        url.searchParams.set('what', search.term);
        url.searchParams.set('where', search.location);
        url.searchParams.set('content-type', 'application/json');
        const safeUrl = new URL(url);
        safeUrl.searchParams.delete('app_id'); safeUrl.searchParams.delete('app_key');
        try {
          console.info('[jobs:request]', JSON.stringify({ url: safeUrl.toString(), source: 'adzuna', query: search.term, location: search.location }));
          const data = await fetchJson(url.toString(), {}, 15000);
          const rows = Array.isArray(data?.results) ? data.results : [];
          let returned = 0;
          for (const r of rows) {
            if (!r?.id || !r?.title || !r?.company?.display_name || !r?.redirect_url) continue;
            const description = stripHtml(r.description || '');
            const location = r.location?.display_name || search.location;
            const job = this.finish({
              source: 'adzuna', sourceJobId: String(r.id), title: String(r.title), company: String(r.company.display_name),
              location, workMode: inferWorkMode(`${r.title} ${location} ${description.slice(0, 500)}`), description,
              experience: inferExperience(description), salary: salary(r.salary_min, r.salary_max),
              employmentType: inferEmployment(`${r.contract_time || ''} ${r.contract_type || ''} ${r.title}`),
              postedDate: r.created || null, applicationUrl: String(r.redirect_url), applicationMethod: 'External Redirect',
              sourceMetadata: { category: r.category?.label || null, query: search.term, searchedLocation: search.location, adzunaId: String(r.id) },
            });
            if (q.remoteOnly && job.workMode !== 'Remote') continue;
            jobs.set(job.sourceJobId, job); returned++;
          }
          console.info('[jobs:response]', JSON.stringify({ source: 'adzuna', query: search.term, location: search.location, httpStatus: 200, jobsReturned: returned }));
        } catch (e: any) {
          const classified = classify(e); errors.push(classified);
          const status = e instanceof HttpError ? e.status : null;
          console.error('[jobs:error]', JSON.stringify({ source: 'adzuna', query: search.term, location: search.location, httpStatus: status, errorReason: classified.message }));
          if (classified.status === 'authentication_required' || classified.status === 'rate_limited') stop = true;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, searches.length) }, worker));
    const attempts = Math.min(next, searches.length);
    if (jobs.size) {
      const out = [...jobs.values()];
      if (errors.length) out[0].sourceMetadata.searchDiagnostics = { searchesGenerated: searches.length, requestsAttempted: attempts, errors: errors.map((e) => e.message) };
      return out;
    }
    if (errors.length) throw errors[0];
    const examples = searches.slice(0, 4).map((s) => `${s.term} in ${s.location}`).join('; ');
    throw new ConnectorError('no_results', `No jobs matched ${attempts} Adzuna searches. Examples: ${examples}${searches.length > 4 ? '; more searches were generated' : ''}.`, false);
  }
}
