import type { ApplicationRequirements, ConnectorContext, JobSourceConnector, NormalizedJob, SearchQuery, ConnectorInfo, ConnectorStatus } from './types.js';
import { extractSkills } from '../utils/skills.js';

export function inferWorkMode(text: string): NormalizedJob['workMode'] {
  const t = text.toLowerCase();
  if (/\bhybrid\b/.test(t)) return 'Hybrid';
  if (/\bremote\b|work from home|wfh|anywhere/.test(t)) return 'Remote';
  if (/on-?site|in-?office/.test(t)) return 'Onsite';
  return 'Unknown';
}
export function inferEmployment(text: string): NormalizedJob['employmentType'] {
  const t = text.toLowerCase();
  if (/\bintern(ship)?\b|\btrainee\b|\bapprentice/.test(t)) return 'Internship';
  if (/part[- ]time/.test(t)) return 'Part-time';
  if (/\bcontract(or)?\b|freelance/.test(t)) return 'Contract';
  if (/full[- ]time|permanent/.test(t)) return 'Full-time';
  return 'Unknown';
}
export function inferExperience(text: string): string | null {
  const m = text.match(/(\d{1,2})\s*\+?\s*(?:-|to)?\s*(\d{1,2})?\s*\+?\s*years?/i);
  return m ? `${m[1]}${m[2] ? '-' + m[2] : '+'} years` : null;
}

/** Shared helpers for connectors that are keyword-filtered locally. */
export function relevant(job: Pick<NormalizedJob, 'title' | 'description' | 'skills'>, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const hay = `${job.title} ${job.skills.join(' ')} ${job.description.slice(0, 1500)}`.toLowerCase();
  const titleHay = job.title.toLowerCase();
  return keywords.some((k) => {
    const words = k.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !['and', 'the', 'for'].includes(w));
    if (!words.length) return false;
    return words.every((w) => hay.includes(w)) || words.some((w) => titleHay.includes(w) && w.length > 3);
  });
}

export abstract class BaseConnector implements JobSourceConnector {
  abstract info: ConnectorInfo;
  abstract checkStatus(ctx: ConnectorContext): Promise<{ status: ConnectorStatus; message: string }>;
  abstract searchJobs(q: SearchQuery, ctx: ConnectorContext): Promise<NormalizedJob[]>;
  async getJobDetails(job: NormalizedJob): Promise<NormalizedJob> { return job; }
  getApplicationUrl(job: NormalizedJob): string { return job.applicationUrl; }
  getApplicationRequirements(job: NormalizedJob): ApplicationRequirements {
    return { method: 'External Redirect', requiresLogin: true, resumeRequired: true, fields: ['resume', 'cover_letter', 'answers'], notes: `Complete the final step on ${this.info.label}'s official page.` };
  }
  protected finish(j: Omit<NormalizedJob, 'skills'> & { skills?: string[] }): NormalizedJob {
    return { ...j, skills: j.skills?.length ? j.skills : extractSkills(`${j.title} ${j.description}`) };
  }
}
