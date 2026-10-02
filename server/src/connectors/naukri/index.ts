import { BaseConnector } from '../base.js';
import type { ConnectorContext, NormalizedJob, SearchQuery } from '../types.js';

/**
 * Naukri connector.
 * Naukri offers no public job-search API for individuals; automation is restricted by its terms. HYRD does not scrape Naukri. Use the official page for applying.
 * Implementing this interface with an authorized integration is the only change needed to enable it:
 * searchJobs() should call the official API with the credentials from ctx.credentials.
 */
export class NaukriConnector extends BaseConnector {
  info = { source: 'naukri', label: 'Naukri', kind: 'platform' as const, description: 'Naukri listings (requires an authorized integration).', officialUrl: 'https://www.naukri.com', policy: 'Naukri offers no public job-search API for individuals; automation is restricted by its terms. HYRD does not scrape Naukri. Use the official page for applying.' };
  async checkStatus(ctx: ConnectorContext) {
    if (ctx.credentials?.accessToken) return { status: 'available' as const, message: 'Credentials stored, but no partner integration is bundled. HYRD will not scrape Naukri.' };
    return { status: 'unsupported' as const, message: 'Naukri offers no public job-search API for individuals; automation is restricted by its terms. HYRD does not scrape Naukri. Use the official page for applying.' };
  }
  async searchJobs(_q: SearchQuery, _ctx: ConnectorContext): Promise<NormalizedJob[]> {
    // Intentionally returns nothing: no legitimate public API is bundled. The manager reports this status to the user.
    return [];
  }
}
