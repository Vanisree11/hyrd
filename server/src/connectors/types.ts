export type ConnectorStatus = 'connected' | 'available' | 'authentication_required' | 'unsupported' | 'rate_limited' | 'no_results' | 'failed';
export type ApplicationMethod = 'API' | 'MCP' | 'Browser' | 'External Redirect';

export interface NormalizedJob {
  id?: string;
  source: string;
  sourceJobId: string;
  title: string;
  company: string;
  location: string;
  workMode: 'Remote' | 'Hybrid' | 'Onsite' | 'Unknown';
  description: string;
  skills: string[];
  experience: string | null;
  salary: string | null;
  employmentType: 'Internship' | 'Full-time' | 'Part-time' | 'Contract' | 'Unknown';
  postedDate: string | null;
  applicationUrl: string;
  applicationMethod: ApplicationMethod;
  sourceMetadata: Record<string, any>;
  isDemo?: boolean;
}

export interface SearchQuery { keywords: string[]; locations: string[]; remoteOnly?: boolean; remoteOk?: boolean; limit?: number }
export interface ConnectorContext { userId: number; credentials?: Record<string, string> | null }
export interface ApplicationRequirements { method: ApplicationMethod; requiresLogin: boolean; resumeRequired: boolean; fields: string[]; notes: string }

export interface ConnectorInfo {
  source: string;
  label: string;
  kind: 'public-feed' | 'company-careers' | 'platform' | 'demo';
  description: string;
  officialUrl: string;
  /** Terms/automation notes surfaced in the UI */
  policy: string;
}

export interface JobSourceConnector {
  info: ConnectorInfo;
  /** Cheap capability check; never throws. */
  checkStatus(ctx: ConnectorContext): Promise<{ status: ConnectorStatus; message: string }>;
  searchJobs(q: SearchQuery, ctx: ConnectorContext): Promise<NormalizedJob[]>;
  getJobDetails(job: NormalizedJob, ctx: ConnectorContext): Promise<NormalizedJob>;
  getApplicationRequirements(job: NormalizedJob): ApplicationRequirements;
  getApplicationUrl(job: NormalizedJob): string;
}

export class ConnectorError extends Error {
  constructor(public status: ConnectorStatus, message: string, public retryable = false) { super(message); }
}
