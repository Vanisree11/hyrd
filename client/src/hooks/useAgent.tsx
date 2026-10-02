import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { api, streamUrl } from '../lib/api';
import { AgentEvent, Run } from '../types';

interface AgentCtx { events: AgentEvent[]; run: Run | null; running: boolean; start: (goal: string) => Promise<void>; refresh: () => Promise<void>; tick: number; error: string }
const Ctx = createContext<AgentCtx>(null as any);
export const useAgent = () => useContext(Ctx);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [tick, setTick] = useState(0); // bumps whenever data on the server changed (for page refetches)
  const [error, setError] = useState('');
  const runIdRef = useRef<number | null>(null);

  const loadRun = useCallback(async (id?: number | null) => {
    try {
      const d = await api<{ running: boolean; runs: Run[] }>('/agent/runs');
      const r = (id ? d.runs.find((x) => x.id === id) : null) || d.runs[0] || null;
      setRun(r); setRunning(d.running); if (r) runIdRef.current = r.id;
    } catch {}
  }, []);

  useEffect(() => {
    api<AgentEvent[]>('/agent/activity?limit=150').then(setEvents).catch(() => {});
    loadRun();
    const es = new EventSource(streamUrl());
    let t: any;
    es.onmessage = (m) => {
      const e: AgentEvent = JSON.parse(m.data);
      setEvents((prev) => [...prev.slice(-299), e]);
      if (e.runId) runIdRef.current = e.runId;
      if (e.type === 'AGENT_STARTED') setRunning(true);
      if (['AGENT_COMPLETED', 'AGENT_FAILED'].includes(e.type)) setRunning(false);
      clearTimeout(t); t = setTimeout(() => { loadRun(runIdRef.current); setTick((x) => x + 1); }, 250);
    };
    return () => { es.close(); clearTimeout(t); };
  }, [loadRun]);

  const start = async (goal: string) => {
    setError('');
    try { const r = await api<{ runId: number }>('/agent/run', { body: { goal } }); runIdRef.current = r.runId; setRunning(true); await loadRun(r.runId); }
    catch (e: any) { setError(e.message); throw e; }
  };
  return <Ctx.Provider value={{ events, run, running, start, refresh: () => loadRun(runIdRef.current), tick, error }}>{children}</Ctx.Provider>;
}
