import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db } from './db/index.js';
import { api, mcp } from './routes/index.js';
import { errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: (origin, cb) => (!origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes('*') ? cb(null, true) : cb(new Error('Not allowed by CORS'))), credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.get('/api/health', (_req, res) => {
    let database = false;
    try { database = !!db.prepare('SELECT 1 AS ok').get(); } catch { /* health reports a degraded state */ }
    res.json({ ok: database, status: database ? 'ok' : 'degraded', name: 'hyrd', database,
      connectors: { adzuna: !!(config.adzuna.appId && config.adzuna.appKey), remotive: true, arbeitnow: true, remoteok: true,
        companyCareers: !!(config.greenhouseBoards.length || config.leverCompanies.length) }, time: new Date().toISOString() });
  });
  app.use('/api', api);
  app.use('/mcp', mcp);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Single-service deployment: serve the built client when present.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = [path.resolve(here, '../../client/dist'), path.resolve(here, '../client/dist')].find((p) => fs.existsSync(path.join(p, 'index.html')));
  if (clientDist) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/(api|mcp)\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}

if (process.argv[1] && /index\.(ts|js)$/.test(process.argv[1])) {
  createApp().listen(config.port, () => console.log(`[hyrd] API listening on http://localhost:${config.port}`));
}
