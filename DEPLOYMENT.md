# Deployment

## Option A (simplest): one Render service serves API + UI
1. Push this repo to GitHub.
2. Render -> **New -> Blueprint** -> select the repo (uses `render.yaml`), or create a **Web Service** manually:
   * Build: `npm install && npm run build`
   * Start: `npm start`
   * Add a **Disk** mounted at `/var/data` (1 GB). SQLite and uploads live here.
3. Environment variables:
   ```
   NODE_ENV=production
   JWT_SECRET=<long random string>
   CREDENTIAL_KEY=<32+ random chars>
   DATABASE_PATH=/var/data/hyrd.db
   UPLOAD_DIR=/var/data/uploads
   AI_PROVIDER=gemini            # or groq / none
   GEMINI_API_KEY=<key>          # optional
   GREENHOUSE_BOARDS=stripe,airbnb,databricks,cloudflare
   LEVER_COMPANIES=netflix,palantir
   ```
4. Open the Render URL. That is your public demo URL. Health check: `/api/health`.

## Option B: Vercel (UI) + Render (API)
1. Deploy the API on Render as above and set `CORS_ORIGINS=https://<your-app>.vercel.app`.
2. Vercel -> **Add New Project** -> same repo -> **Root Directory: `client`**, framework Vite.
   Env var: `VITE_API_URL=https://<your-render-service>.onrender.com`. (`client/vercel.json` handles SPA routing.)
3. Put the final Vercel URL into the API's `CORS_ORIGINS` and redeploy the API.

## Database
SQLite on a persistent disk is fine for a hackathon demo (single instance). Render tiers without a disk lose data on restart.
The schema (`server/src/db/schema.sql`) is portable. Moving to PostgreSQL/Supabase means replacing `server/src/db/index.ts` and the `better-sqlite3` calls with `pg`
(`AUTOINCREMENT` -> `SERIAL`, `datetime('now')` -> `now()`).

## Optional: browser automation in production
Set `ENABLE_BROWSER=true` and use this build command: `npm install && npm run build && npx playwright install --with-deps chromium`.
Browser mode applies only to Greenhouse/Lever company pages without CAPTCHA/login; everything else falls back to the guided external flow.
