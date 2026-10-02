export class HttpError extends Error {
  constructor(public status: number, message: string, public retryable = false) { super(message); }
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with timeout + classified errors so recovery can decide whether to retry. */
export async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': 'HYRD-Agent/1.0 (job-search assistant)', Accept: 'application/json', ...(init.headers || {}) } });
    if (res.status === 429) throw new HttpError(429, 'rate limited by source', true);
    if (res.status === 401 || res.status === 403) throw new HttpError(res.status, 'source requires authorization', false);
    if (res.status >= 500) throw new HttpError(res.status, `source error ${res.status}`, true);
    if (!res.ok) throw new HttpError(res.status, `unexpected status ${res.status}`, false);
    return await res.json();
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    if (e?.name === 'AbortError') throw new HttpError(0, 'request timed out', true);
    throw new HttpError(0, `network error: ${e?.cause?.code || e?.message || 'unknown'}`, true);
  } finally { clearTimeout(t); }
}

/** Retry with exponential backoff, retryable errors only. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: { retries?: number; baseMs?: number } = {}): Promise<{ value: T; attempts: number }> {
  const retries = opts.retries ?? 1;
  let attempt = 0;
  for (;;) {
    attempt++;
    try { return { value: await fn(attempt), attempts: attempt }; }
    catch (e: any) {
      const retryable = typeof e?.retryable === 'boolean' ? e.retryable : true;
      if (!retryable || attempt > retries) { (e as any).attempts = attempt; throw e; }
      await sleep((opts.baseMs ?? 400) * 2 ** (attempt - 1));
    }
  }
}
