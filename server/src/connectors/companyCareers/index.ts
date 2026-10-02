import { BaseConnector, inferEmployment, inferExperience, inferWorkMode, relevant } from '../base.js';
import type { ConnectorContext, NormalizedJob, SearchQuery } from '../types.js';
import { ConnectorError } from '../types.js';
import { fetchJson, HttpError } from '../../utils/http.js';
import { stripHtml } from '../../utils/skills.js';
import { config } from '../../config.js';

/**
 * Company career pages through the official public job-board APIs of Greenhouse and Lever.
 * These endpoints are published by the ATS vendors precisely so job listings can be consumed.
 */
export class CompanyCareersConnector extends BaseConnector {
  info = { source: 'company_careers', label: 'Company Careers', kind: 'company-careers' as const, description: 'Official public career-board APIs (Greenhouse & Lever) for configured companies.', officialUrl: 'https://developers.greenhouse.io/job-board.html', policy: 'Uses ATS vendors\' public job-board APIs. Applying happens on the company\'s own page.' };
  async checkStatus() {
    if (!config.greenhouseBoards.length && !config.leverCompanies.length) return { status: 'unsupported' as const, message: 'No company boards configured (GREENHOUSE_BOARDS / LEVER_COMPANIES)' };
    const first = config.greenhouseBoards[0];
    try {
      if (first) await fetchJson(`${config.publicFeedBase.greenhouse}/${first}/jobs`, {}, 8000);
      else await fetchJson(`${config.publicFeedBase.lever}/${config.leverCompanies[0]}?mode=json&limit=1`, {}, 8000);
      return { status: 'connected' as const, message: `${config.greenhouseBoards.length} Greenhouse + ${config.leverCompanies.length} Lever boards configured` };
    } catch (e: any) { return { status: 'failed' as const, message: e.message }; }
  }
  async searchJobs(q: SearchQuery): Promise<NormalizedJob[]> {
    const out: NormalizedJob[] = [];
    const errors: string[] = [];
    await Promise.all([
      ...config.greenhouseBoards.map(async (board) => {
        try {
          const data = await fetchJson(`${config.publicFeedBase.greenhouse}/${board}/jobs?content=true`, {}, 20000);
          for (const r of data.jobs || []) {
            const description = stripHtml(decodeEntities(r.content || ''));
            const loc = r.location?.name || 'Unknown';
            const job = this.finish({
              source: 'company_careers', sourceJobId: `gh:${board}:${r.id}`, title: r.title, company: prettify(board), location: loc,
              workMode: inferWorkMode(`${loc} ${r.title}`), description, experience: inferExperience(description), salary: null,
              employmentType: inferEmployment(r.title), postedDate: r.updated_at || r.first_published || null, applicationUrl: r.absolute_url,
              applicationMethod: 'External Redirect', sourceMetadata: { ats: 'greenhouse', board, departments: r.departments?.map((d: any) => d.name) },
            });
            if (relevant(job, q.keywords)) out.push(job);
          }
        } catch (e: any) { errors.push(`greenhouse:${board}:${e.message}`); }
      }),
      ...config.leverCompanies.map(async (co) => {
        try {
          const data = await fetchJson(`${config.publicFeedBase.lever}/${co}?mode=json`, {}, 20000);
          for (const r of data || []) {
            const description = `${r.descriptionPlain || stripHtml(r.description || '')} ${(r.lists || []).map((l: any) => stripHtml(l.content || '')).join(' ')}`;
            const loc = r.categories?.location || 'Unknown';
            const job = this.finish({
              source: 'company_careers', sourceJobId: `lv:${co}:${r.id}`, title: r.text, company: prettify(co), location: loc,
              workMode: r.workplaceType ? (r.workplaceType === 'remote' ? 'Remote' : r.workplaceType === 'hybrid' ? 'Hybrid' : 'Onsite') : inferWorkMode(`${loc} ${r.text}`),
              description, experience: inferExperience(description), salary: null, employmentType: inferEmployment(`${r.categories?.commitment || ''} ${r.text}`),
              postedDate: r.createdAt ? new Date(r.createdAt).toISOString() : null, applicationUrl: r.applyUrl || r.hostedUrl, applicationMethod: 'External Redirect',
              sourceMetadata: { ats: 'lever', company: co, team: r.categories?.team },
            });
            if (relevant(job, q.keywords)) out.push(job);
          }
        } catch (e: any) { errors.push(`lever:${co}:${e.message}`); }
      }),
    ]);
    if (!out.length && errors.length) throw new ConnectorError('failed', errors.slice(0, 3).join('; '), true);
    return out;
  }
}
const prettify = (s: string) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const decodeEntities = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
