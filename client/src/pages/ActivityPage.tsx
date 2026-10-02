import { useAgent } from '../hooks/useAgent';
import { PageHeader, Badge } from '../components/ui';
import { clock } from '../lib/format';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Run } from '../types';

export default function ActivityPage() {
  const { events, tick } = useAgent();
  const [runs, setRuns] = useState<Run[]>([]);
  useEffect(() => { api('/agent/runs').then((d) => setRuns(d.runs)).catch(() => {}); }, [tick]);
  const feed = [...events].filter((e) => e.type !== 'TASK_UPDATED').reverse();
  return (
    <div>
      <PageHeader title="Activity" sub="Everything the agent did — persisted and live." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3"><h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white">Event log</h2>
          <ol className="space-y-3 border-l border-ink-500 pl-4">{feed.length === 0 && <li className="text-sm text-zinc-500">No activity yet.</li>}{feed.slice(0, 120).map((e) => <li key={e.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-hyrd" /><div className="text-xs text-zinc-600">{clock(e.createdAt)} • {e.type.replace(/_/g, ' ')}</div><div className="text-sm text-zinc-200">{e.message}</div></li>)}</ol></div>
        <div className="card p-5 lg:col-span-2"><h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white">Agent runs</h2>
          <ul className="space-y-3">{runs.length === 0 && <li className="text-sm text-zinc-500">No runs yet.</li>}{runs.map((r) => <li key={r.id} className="rounded-xl border border-ink-500 bg-ink-900 p-3"><div className="flex items-center justify-between"><span className="text-xs text-zinc-500">Run #{r.id} • {clock(r.startedAt)}</span><Badge k={r.status === 'failed' ? 'Failed' : r.status === 'running' ? 'Applying' : 'Submitted'}>{r.status.replace('_', ' ')}</Badge></div>
            <div className="mt-1 line-clamp-2 text-sm text-zinc-300">{r.goal}</div><div className="mt-1 text-xs text-zinc-500">{r.stats.jobsFound ?? 0} found • {r.stats.uniqueJobs ?? 0} unique • {r.stats.strongMatches ?? 0} strong • {r.stats.prepared ?? 0} prepared</div></li>)}</ul></div>
      </div>
    </div>);
}
