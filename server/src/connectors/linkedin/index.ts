import { BaseConnector } from '../base.js';
import type { ConnectorContext, NormalizedJob, SearchQuery } from '../types.js';

/**
 * LinkedIn connector.
 * LinkedIn Jobs has no public search API; access needs LinkedIn partner approval. HYRD does not scrape LinkedIn (violates its terms). Use the official page for applying.
 * Implementing this interface with an authorized integration is the only change needed to enable it:
 * searchJobs() should call the official API with the credentials from ctx.credentials.
 */
export class LinkedInConnector extends BaseConnector {
  info = { source: 'linkedin', label: 'LinkedIn', kind: 'platform' as const, description: 'LinkedIn listings (requires an authorized integration).', officialUrl: 'https://www.linkedin.com/jobs', policy: 'LinkedIn Jobs has no public search API; access needs LinkedIn partner approval. HYRD does not scrape LinkedIn (violates its terms). Use the official page for applying.' };
  async checkStatus(ctx: ConnectorContext) {
    if (ctx.credentials?.accessToken) return { status: 'available' as const, message: 'Credentials stored, but no partner integration is bundled. HYRD will not scrape LinkedIn.' };
    return { status: 'unsupported' as const, message: 'LinkedIn Jobs has no public search API; access needs LinkedIn partner approval. HYRD does not scrape LinkedIn (violates its terms). Use the official page for applying.' };
  }
  async searchJobs(_q: SearchQuery, _ctx: ConnectorContext): Promise<NormalizedJob[]> {
    // Intentionally returns nothing: no legitimate public API is bundled. The manager reports this status to the user.
    return [];
  }
}
