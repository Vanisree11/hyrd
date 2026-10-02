import { AgentPanel } from '../components/AgentPanel';
import { GoalBox } from '../components/GoalBox';
import { useAgent } from '../hooks/useAgent';
import { PageHeader, Badge } from '../components/ui';
import { clock } from '../lib/format';
import { Target } from 'lucide-react';

export default function AgentPage() {
  const { run } = useAgent();
  const g = run?.parsedGoal;
  return (
    <div>
      <PageHeader title="AI Agent" sub="Give HYRD a goal. It plans, searches, matches, prepares — then waits for you." />
      <div className="mb-6 card p-5"><div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white"><Target className="h-4 w-4 text-hyrd" />Goal</div><GoalBox big /></div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3"><AgentPanel /></div>
        <div className="space-y-6 lg:col-span-2">
          {g?.roles && <div className="card p-5"><h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white">Goal understood</h2>
            <dl className="space-y-2 text-sm">{[['Role', g.roles.join(', ')], ['Location', [...g.locations, g.remoteOk ? 'Remote' : ''].filter(Boolean).join(' / ') || 'Anywhere'], ['Type', g.employmentTypes?.join(', ') || 'Any'], ['Minimum match', `${g.minMatch}%`], ['Action', g.action === 'prepare' ? 'Prepare applications' : 'Search & rank only'], ['Approval', 'Required before submission']].map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-zinc-500">{k}</dt><dd className="text-right text-zinc-200">{v}</dd></div>)}</dl></div>}
          {run?.connectorRuns?.length ? <div className="card p-5"><h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white">Connector results</h2><ul className="space-y-2">{run.connectorRuns.map((c: any) => <li key={c.source} className="text-sm"><div className="flex items-center justify-between"><span className="capitalize text-zinc-200">{c.source.replace('_', ' ')}</span><Badge k={c.status}>{c.status.replace(/_/g, ' ')}</Badge></div><div className="mt-0.5 text-xs text-zinc-500">{c.message}{c.attempts > 1 ? ` • ${c.attempts} attempts` : ''}</div></li>)}</ul></div> : null}
        </div>
      </div>
    </div>);
}
