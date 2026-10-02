import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// npm workspaces run each script from that package's directory. HYRD's documented
// .env file lives at the project root, so load it explicitly from either cwd.
dotenv.config({ path: path.resolve(here, '../../.env') });
dotenv.config({ path: path.resolve(here, '../.env') });

const bool = (v: string | undefined, d = false) => (v === undefined ? d : ['1', 'true', 'yes'].includes(v.toLowerCase()));
const list = (v: string | undefined) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 8787),
  env: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  credentialKey: process.env.CREDENTIAL_KEY || 'dev-insecure-credential-key-change-me!!',
  corsOrigins: list(process.env.CORS_ORIGINS || 'http://localhost:5173'),
  dbPath: path.resolve(process.env.DATABASE_PATH || './data/hyrd.db'),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  ai: {
    provider: (process.env.AI_PROVIDER || 'none').toLowerCase(),
    geminiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    groqKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },
  greenhouseBoards: list(process.env.GREENHOUSE_BOARDS),
  leverCompanies: list(process.env.LEVER_COMPANIES),
  adzuna: {
    appId: process.env.ADZUNA_APP_ID || '',
    appKey: process.env.ADZUNA_APP_KEY || '',
    country: (process.env.ADZUNA_COUNTRY || 'in').toLowerCase(),
    baseUrl: process.env.ADZUNA_API_URL || 'https://api.adzuna.com/v1/api/jobs',
  },
  demoMode: bool(process.env.DEMO_MODE),
  enableBrowser: bool(process.env.ENABLE_BROWSER),
  browserHeadless: bool(process.env.BROWSER_HEADLESS, true),
  publicFeedBase: {
    remotive: process.env.REMOTIVE_URL || 'https://remotive.com/api/remote-jobs',
    arbeitnow: process.env.ARBEITNOW_URL || 'https://www.arbeitnow.com/api/job-board-api',
    remoteok: process.env.REMOTEOK_URL || 'https://remoteok.com/api',
    greenhouse: process.env.GREENHOUSE_URL || 'https://boards-api.greenhouse.io/v1/boards',
    lever: process.env.LEVER_URL || 'https://api.lever.co/v0/postings',
  },
};
if (config.env === 'production' && config.jwtSecret.startsWith('dev-')) console.warn('[hyrd] WARNING: set JWT_SECRET in production');
