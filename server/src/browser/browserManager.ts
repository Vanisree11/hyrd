import { config } from '../config.js';

let browserPromise: Promise<any> | null = null;
export async function playwrightAvailable(): Promise<{ ok: boolean; reason: string }> {
  if (!config.enableBrowser) return { ok: false, reason: 'ENABLE_BROWSER is false' };
  try { const pw: any = await import('playwright'); await (pw.chromium.executablePath?.() ?? ''); return { ok: true, reason: 'ok' }; }
  catch (e: any) { return { ok: false, reason: `Playwright not installed (${e.message}). Run: npx playwright install chromium` }; }
}
export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      const pw: any = await import('playwright');
      return pw.chromium.launch({ headless: config.browserHeadless });
    })();
    browserPromise.catch(() => { browserPromise = null; });
  }
  return browserPromise;
}
export async function closeBrowser() { if (browserPromise) { try { (await browserPromise).close(); } catch {} browserPromise = null; } }

/** Open sessions are kept between "fill" and "confirm submit" so a human can review before the irreversible click. */
const sessions = new Map<number, { page: any; context: any; createdAt: number }>();
export async function openSession(applicationId: number) {
  await closeSession(applicationId);
  const browser = await getBrowser();
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (HYRD assisted application; user-approved)' });
  const page = await context.newPage();
  sessions.set(applicationId, { page, context, createdAt: Date.now() });
  return page;
}
export const getSession = (id: number) => sessions.get(id)?.page;
export async function closeSession(id: number) { const s = sessions.get(id); if (s) { try { await s.context.close(); } catch {} sessions.delete(id); } }
setInterval(() => { for (const [id, s] of sessions) if (Date.now() - s.createdAt > 30 * 60_000) closeSession(id); }, 60_000).unref();
