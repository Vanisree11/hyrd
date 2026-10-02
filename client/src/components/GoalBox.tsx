import { useEffect, useState } from 'react';
import { Play, Loader2 } from 'lucide-react';
import { useAgent } from '../hooks/useAgent';
import { ErrorNote } from './ui';

const DEFAULT = 'Find software engineering internships in India matching my resume, preferably remote or Bangalore, and prepare applications for jobs above 80% match.';
export function GoalBox({ big = false }: { big?: boolean }) {
  const { start, running, error } = useAgent();
  const [goal, setGoal] = useState(() => localStorage.getItem('hyrd_goal') || DEFAULT);
  const [busy, setBusy] = useState(false);
  useEffect(() => localStorage.setItem('hyrd_goal', goal), [goal]);
  const go = async () => { setBusy(true); try { await start(goal); } catch {} finally { setBusy(false); } };
  return (
    <div className="space-y-3">
      <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={big ? 3 : 2} className="input" placeholder="Tell HYRD what to achieve…" />
      <ErrorNote msg={error} />
      <button onClick={go} disabled={running || busy || goal.trim().length < 5} className="btn-primary !px-6 !py-3 tracking-widest">
        {running || busy ? <><Loader2 className="h-4 w-4 animate-spin" />AGENT RUNNING</> : <><Play className="h-4 w-4 fill-black" />START AGENT</>}</button>
    </div>);
}
