import { z } from 'zod';
import { db } from '../db/index.js';
import { getJob, getProfile } from '../services/store.js';
import { ai } from '../services/ai/index.js';
import { scoreJob } from '../agents/matching/index.js';
import { searchAll, type SearchHooks } from '../connectors/manager.js';
import { getApplication, getHistory, prepareApplication } from '../services/applications.js';
import { ApplicationExecutor } from '../agents/application/executor.js';

export interface ToolContext { userId: number; runId?: number | null; hooks?: SearchHooks }
interface Tool { name: string; description: string; inputSchema: any; zod: z.ZodTypeAny; handler: (ctx: ToolContext, args: any) => Promise<any> }

const idArg = z.object({ jobId: z.number().int() });
const appArg = z.object({ applicationId: z.number().int() });

export const tools: Tool[] = [
  {
    name: 'search_jobs', description: 'Search every enabled job-source connector for current listings. Returns per-source status and raw normalized jobs.',
    inputSchema: { type: 'object', properties: { keywords: { type: 'array', items: { type: 'string' } }, locations: { type: 'array', items: { type: 'string' } }, remoteOnly: { type: 'boolean' } }, required: ['keywords'] },
    zod: z.object({ keywords: z.array(z.string()).max(10), locations: z.array(z.string()).optional(), remoteOnly: z.boolean().optional() }),
    handler: async (ctx, a) => searchAll(ctx.userId, ctx.runId ?? null, { keywords: a.keywords, locations: a.locations || [], remoteOnly: a.remoteOnly }, ctx.hooks),
  },
  {
    name: 'get_job_details', description: 'Get a stored job with its match, eligibility and application requirements.',
    inputSchema: { type: 'object', properties: { jobId: { type: 'number' } }, required: ['jobId'] }, zod: idArg,
    handler: async (ctx, a) => getJob(ctx.userId, a.jobId),
  },
  {
    name: 'analyze_job', description: 'Score a stored job against the candidate profile (transparent rule engine) and explain it.',
    inputSchema: { type: 'object', properties: { jobId: { type: 'number' } }, required: ['jobId'] }, zod: idArg,
    handler: async (ctx, a) => {
      const job = getJob(ctx.userId, a.jobId); if (!job) throw new Error('Job not found');
      const p = getProfile(ctx.userId); const m = scoreJob(p, job as any);
      return { ...m, explanation: await ai.explainMatch(p, { ...job, description: job.description || '', skills: job.skills, location: job.location || '', employmentType: job.employmentType || '' }, m) };
    },
  },
  {
    name: 'prepare_application', description: 'Generate cover letter + answers and queue the application for human approval. Never submits.',
    inputSchema: { type: 'object', properties: { jobId: { type: 'number' } }, required: ['jobId'] }, zod: idArg,
    handler: async (ctx, a) => prepareApplication(ctx.userId, a.jobId, ctx.runId ?? null),
  },
  {
    name: 'open_application', description: 'Return the official application URL and requirements for a prepared application.',
    inputSchema: { type: 'object', properties: { applicationId: { type: 'number' } }, required: ['applicationId'] }, zod: appArg,
    handler: async (ctx, a) => { const app = getApplication(ctx.userId, a.applicationId); if (!app) throw new Error('not found'); return { url: app.job?.applicationUrl, method: app.job?.applicationMethod, status: app.status }; },
  },
  {
    name: 'fill_application', description: 'Execute an APPROVED application with the best legitimate method (API / Browser / external redirect). Stops before the irreversible submit when a browser is used.',
    inputSchema: { type: 'object', properties: { applicationId: { type: 'number' } }, required: ['applicationId'] }, zod: appArg,
    handler: async (ctx, a) => new ApplicationExecutor(ctx.userId).execute(a.applicationId),
  },
  {
    name: 'verify_application', description: 'Return verification evidence recorded for an application.',
    inputSchema: { type: 'object', properties: { applicationId: { type: 'number' } }, required: ['applicationId'] }, zod: appArg,
    handler: async (ctx, a) => { const app = getApplication(ctx.userId, a.applicationId); if (!app) throw new Error('not found'); return { status: app.status, result: app.executionResult, verified: ['Submitted', 'Under Review', 'Interview', 'Offer'].includes(app.status) }; },
  },
  {
    name: 'get_application_status', description: 'Get status and history for an application.',
    inputSchema: { type: 'object', properties: { applicationId: { type: 'number' } }, required: ['applicationId'] }, zod: appArg,
    handler: async (ctx, a) => { const app = getApplication(ctx.userId, a.applicationId); if (!app) throw new Error('not found'); return { status: app.status, history: getHistory(app.id) }; },
  },
];

export async function callTool(ctx: ToolContext, name: string, args: any) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw Object.assign(new Error(`Unknown tool ${name}`), { status: 404 });
  return t.handler(ctx, t.zod.parse(args ?? {}));
}
export const toolList = () => tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
