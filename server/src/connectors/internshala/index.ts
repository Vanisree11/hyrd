import { BaseConnector } from '../base.js';
import type { ConnectorContext, NormalizedJob, SearchQuery } from '../types.js';

/**
 * Internshala connector.
 * Internshala has no public API and requires login for applications. HYRD does not scrape Internshala. Use the official page for applying.
 * Implementing this interface with an authorized integration is the only change needed to enable it:
 * searchJobs() should call the official API with the credentials from ctx.credentials.
 */
export class InternshalaConnector extends BaseConnector {
  info = { source: 'internshala', label: 'Internshala', kind: 'platform' as const, description: 'Internshala listings (requires an authorized integration).', officialUrl: 'https://internshala.com', policy: 'Internshala has no public API and requires login for applications. HYRD does not scrape Internshala. Use the official page for applying.' };
  async checkStatus(ctx: ConnectorContext) {
    if (ctx.credentials?.accessToken) return { status: 'available' as const, message: 'Credentials stored, but no partner integration is bundled. HYRD will not scrape Internshala.' };
    return { status: 'unsupported' as const, message: 'Internshala has no public API and requires login for applications. HYRD does not scrape Internshala. Use the official page for applying.' };
  }
  async searchJobs(_q: SearchQuery, _ctx: ConnectorContext): Promise<NormalizedJob[]> {
    // Intentionally returns nothing: no legitimate public API is bundled. The manager reports this status to the user.
    return [];
  }
}
