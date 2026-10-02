import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, getToken, setToken } from './api';
interface User { id: number; email: string; name: string }
const Ctx = createContext<{ user: User | null; loading: boolean; login: (e: string, p: string) => Promise<void>; register: (n: string, e: string, p: string) => Promise<void>; logout: () => Promise<void> }>(null as any);
export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  useEffect(() => {
    if (getToken()) api<User>('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
    const out = () => setUser(null); window.addEventListener('hyrd-logout', out); return () => window.removeEventListener('hyrd-logout', out);
  }, []);
  const finish = (d: any) => { setToken(d.token); setUser(d.user); };
  return <Ctx.Provider value={{
    user, loading,
    login: async (email, password) => finish(await api('/auth/login', { body: { email, password } })),
    register: async (name, email, password) => finish(await api('/auth/register', { body: { name, email, password } })),
    logout: async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setToken(null); setUser(null); },
  }}>{children}</Ctx.Provider>;
}
