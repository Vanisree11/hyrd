import { BaseConnector } from '../base.js';
import type { ConnectorContext, NormalizedJob, SearchQuery } from '../types.js';

/**
 * Indeed connector.
 * The Indeed job-search API is restricted to approved partners and scraping is prohibited by its terms. HYRD does not scrape Indeed. Use the official page for applying.
 * Implementing this interface with an authorized integration is the only change needed to enable it:
 * searchJobs() should call the official API with the credentials from ctx.credentials.
 */
export class IndeedConnector extends BaseConnector {
  info = { source: 'indeed', label: 'Indeed', kind: 'platform' as const, description: 'Indeed listings (requires an authorized integration).', officialUrl: 'https://www.indeed.com', policy: 'The Indeed job-search API is restricted to approved partners and scraping is prohibited by its terms. HYRD does not scrape Indeed. Use the official page for applying.' };
  async checkStatus(ctx: ConnectorContext) {
    if (ctx.credentials?.accessToken) return { status: 'available' as const, message: 'Credentials stored, but no partner integration is bundled. HYRD will not scrape Indeed.' };
    return { status: 'unsupported' as const, message: 'The Indeed job-search API is restricted to approved partners and scraping is prohibited by its terms. HYRD does not scrape Indeed. Use the official page for applying.' };
  }
  async searchJobs(_q: SearchQuery, _ctx: ConnectorContext): Promise<NormalizedJob[]> {
    // Intentionally returns nothing: no legitimate public API is bundled. The manager reports this status to the user.
    return [];
  }
}
