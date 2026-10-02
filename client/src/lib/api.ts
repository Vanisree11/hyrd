const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export const apiBase = BASE;
let token: string | null = localStorage.getItem('hyrd_token');
export const setToken = (t: string | null) => { token = t; t ? localStorage.setItem('hyrd_token', t) : localStorage.removeItem('hyrd_token'); };
export const getToken = () => token;

export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method: opts.method || (opts.body || opts.form ? 'POST' : 'GET'),
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
    });
  } catch (e: any) {
    const target = BASE || 'the local Vite proxy (backend port 8787)';
    throw new ApiError(0, `Cannot reach HYRD backend at ${target}. Start it from the project folder with "npm run dev" and keep the terminal open. (${e?.message || 'network error'})`);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { setToken(null); window.dispatchEvent(new Event('hyrd-logout')); }
  if (!res.ok) throw new ApiError(res.status, data.message || (data.error ? (data.details ? `${data.error}: ${data.details.join('; ')}` : data.error) : `Request failed (${res.status})`));
  return data as T;
}
export const streamUrl = () => `${BASE}/api/agent/stream?token=${encodeURIComponent(token || '')}`;
