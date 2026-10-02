# HYRD — Your Autonomous AI Job Application Agent

> Stop applying manually. Let HYRD do the work.

HYRD takes a **goal** ("find software engineering internships in India, prepare applications for 80%+ matches") and carries it out:
`SEARCH → UNDERSTAND → MATCH → PLAN → PREPARE → HUMAN APPROVAL → APPLY → VERIFY → TRACK`.

## Run locally
```bash
npm install
npm run dev                 # API :8787 + UI :5173
```
Open http://localhost:5173 → register → upload resume → **START AGENT**.

### Enable real India-first Adzuna searches
1. Get an Adzuna API `app_id` and `app_key` from [Adzuna's developer portal](https://developer.adzuna.com/signup).
2. Copy `.env.example` to `.env` in the project root and set `ADZUNA_APP_ID` and `ADZUNA_APP_KEY`. `ADZUNA_COUNTRY` defaults to `in`.
3. Restart HYRD with `npm run dev`. The Adzuna source status appears in **Settings**; job search runs it alongside other enabled sources.

Windows PowerShell setup from the extracted project root:
```powershell
Copy-Item .env.example .env
npm install
npm run dev
```
Leave the terminal open and use http://localhost:5173. No AI API key is needed to fetch jobs. Without Adzuna credentials, HYRD reports Adzuna as not configured and continues to query available public feeds.

Production build (one process serves API + UI):
```bash
npm run build
npm start                   # http://localhost:8787
```
Tests (real server, real DB, real PDF/DOCX uploads; job APIs replaced by a local stand-in): `npm test`

## Architecture
```
client/ (React+Vite+TS+Tailwind)  <-SSE/REST->  server/ (Express+TS)
server/src
  agents/hyrdAgent      orchestrator: plan > search > normalize > dedupe > eligibility > match > prepare > approval gate
  agents/planner        goal -> structured plan (LLM or deterministic)
  agents/matching       transparent scoring (Skills 40 / Eligibility 25 / Role 15 / Experience 10 / Location 10), eligibility, dedupe
  agents/recovery       per-step state, retry + exponential backoff; a failed step does not restart the workflow
  agents/application    ApplicationExecutor: execute() / verify() / recover()  (API | MCP | Browser | External Redirect)
  connectors/           JobSourceConnector interface + manager (parallel, failure-isolated)
  browser/              Playwright: browserManager, pageController, formDetector, formFiller, applicationVerifier
  mcp/                  tool registry + JSON-RPC endpoint at POST /mcp (tools/list, tools/call)
  services/ai           AIProvider (gemini | groq | deterministic fallback)
```

### Connectors (real sources only)
| Connector | Mechanism | Status |
|---|---|---|
| Adzuna | official Jobs API (`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, country defaults to `in`) | live when credentials are configured |
| Remotive, Arbeitnow, RemoteOK | official public APIs/feeds | live |
| Company Careers | Greenhouse + Lever public job-board APIs (`GREENHOUSE_BOARDS`, `LEVER_COMPANIES`) | live when configured |
| LinkedIn, Naukri, Indeed, Internshala | no public API; scraping prohibited | reports `unsupported`; official apply page opened for the human. Interface is ready for an authorized integration |
| Demo Source | mock listings, only if `DEMO_MODE=true`, labelled `[DEMO]` | off by default |

Each connector reports `connected | available | authentication_required | unsupported | rate_limited | no_results | failed`. One failing source never stops the run. Adzuna logs each role/location request and result without logging credentials; its individual requests are capped to a controlled India-first search set.

### Human-in-the-loop guarantees
* The agent only *prepares* applications; they land in `Awaiting Approval`.
* `execute` is rejected (409) unless the application is `Approved`; editing after approval forces re-approval.
* Browser mode fills the form, then **stops**; the final submit needs an explicit confirmation.
* CAPTCHA / login / MFA => "Human action required" (never bypassed).
* HYRD marks `Submitted` only with evidence (page confirmation text, mock API receipt) or after **you** confirm an external submission.

### MCP
`POST /mcp` (Bearer token) exposes: `search_jobs, get_job_details, analyze_job, prepare_application, open_application, fill_application, verify_application, get_application_status`. The agent calls these tools internally too.

### API
See `server/src/routes/index.ts`: auth, profile, resume, agent (`/agent/run`, `/agent/runs`, `/agent/activity`, `/agent/stream` SSE), jobs, applications (`prepare/approve/reject/execute/history`), connectors.
