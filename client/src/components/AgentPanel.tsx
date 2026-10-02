import { useEffect, useRef } from 'react';
import { Bot, Radio } from 'lucide-react';
import { useAgent } from '../hooks/useAgent';
import { TaskIcon, cx } from './ui';
import { clock } from '../lib/format';

const dot: Record<string, string> = { SOURCE_SEARCH_FAILED: 'text-red-400', AGENT_FAILED: 'text-red-400', APPROVAL_REQUIRED: 'text-hyrd', HUMAN_ACTION_REQUIRED: 'text-hyrd', APPLICATION_SUBMITTED: 'text-emerald-400', APPLICATION_VERIFIED: 'text-emerald-400', AGENT_COMPLETED: 'text-emerald-400', INFO: 'text-zinc-500' };

export function AgentPanel({ compact = false }: { compact?: boolean }) {
  const { run, running, events } = useAgent();
  const feed = useRef<HTMLDivElement>(null);
  const shown = events.filter((e) => e.type !== 'TASK_UPDATED' && (!run || e.runId === run.id || e.runId === null)).slice(compact ? -8 : -60);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [shown.length]);
  const s = run?.stats || {};
  const waiting = run?.status === 'awaiting_approval';
  return (
    <div className={cx('card relative overflow-hidden p-5', running && 'border-hyrd/50 shadow-glow-sm')}>
      {running && <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-hyrd/10"><div className="h-full w-1/3 bg-hyrd animate-scan" /></div>}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><div className={cx('grid h-8 w-8 place-items-center rounded-lg bg-hyrd/15 text-hyrd', running && 'animate-pulseRing')}><Bot className="h-4 w-4" /></div>
          <div><div className="text-sm font-bold tracking-widest text-white">HYRD AGENT</div><div className="text-xs text-zinc-500">{running ? 'Working autonomously…' : waiting ? 'Waiting for human approval' : run ? `Last run: ${run.status.replace('_', ' ')}` : 'Idle'}</div></div></div>
        <span className={cx('flex items-center gap-1.5 text-xs', running ? 'text-hyrd' : 'text-zinc-600')}><Radio className="h-3.5 w-3.5" />{running ? 'LIVE' : 'STANDBY'}</span>
      </div>
      {run ? (<>
        {!compact && <div className="mb-4 rounded-xl border border-ink-500 bg-ink-900 p-3 text-sm text-zinc-300"><span className="text-xs uppercase tracking-wider text-zinc-500">Goal</span><div className="mt-1">{run.goal}</div></div>}
        <ul className="space-y-1.5">
          {run.tasks.map((t) => (<li key={t.key} className="flex items-start gap-2.5 text-sm"><div className="mt-0.5"><TaskIcon s={t.status} /></div>
            <div className="min-w-0"><span className={cx(t.status === 'pending' ? 'text-zinc-600' : t.status === 'running' ? 'text-white' : 'text-zinc-300')}>{t.label}</span>
              {t.detail && <span className="ml-2 text-xs text-zinc-500">{t.detail}</span>}{t.attempts && t.attempts > 1 ? <span className="ml-2 text-xs text-hyrd">retry ×{t.attempts - 1}</span> : null}</div></li>))}
        </ul>
        {(s.jobsFound > 0 || s.sources?.length > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[['Jobs found', s.jobsFound], ['Unique', s.uniqueJobs], ['Eligible', s.eligible], ['Ready for review', s.prepared]].map(([l, v]) => <div key={l as string} className="rounded-xl border border-ink-500 bg-ink-900 px-3 py-2"><div className="text-lg font-bold text-white">{v ?? 0}</div><div className="text-[11px] uppercase tracking-wider text-zinc-500">{l}</div></div>)}
          </div>)}
        {(s.jobsFound > 0 || s.sources?.length > 0) && <div className="mt-2 text-xs text-zinc-500">Eligibility: {s.eligible ?? 0} eligible · {s.notEligible ?? 0} not eligible · {s.needsReview ?? 0} need review · {s.potentiallyEligible ?? 0} potentially eligible</div>}
        {run.stats?.sources?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{run.stats.sources.map((x: any) => <span key={x.source} title={x.message} className={cx('chip', x.status === 'connected' ? 'border-emerald-500/30 text-emerald-400' : x.status === 'unsupported' ? 'text-zinc-500' : 'border-red-500/30 text-red-400')}>{x.status === 'connected' ? '✓' : x.status === 'unsupported' ? '–' : '✕'} {x.label}{x.status === 'connected' ? ` ${x.count}` : ''}</span>)}</div>}
        {waiting && <div className="mt-4 rounded-xl border border-hyrd/40 bg-hyrd/10 px-3 py-2 text-sm font-semibold text-hyrd">WAITING FOR HUMAN APPROVAL → open Applications</div>}
        {run.error && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{run.error}</div>}
      </>) : <div className="py-6 text-sm text-zinc-500">No agent runs yet. Give HYRD a goal and it will plan, search, match and prepare applications.</div>}
      <div ref={feed} className={cx('mt-4 space-y-1 overflow-y-auto rounded-xl border border-ink-600 bg-black/60 p-3 font-mono text-xs', compact ? 'max-h-40' : 'max-h-72')}>
        {shown.length === 0 && <div className="text-zinc-600">$ awaiting events…</div>}
        {shown.map((e) => <div key={e.id} className="flex gap-2"><span className="shrink-0 text-zinc-600">{clock(e.createdAt).split(', ').pop()}</span><span className={cx(dot[e.type] || 'text-zinc-300')}>{e.message}</span></div>)}
      </div>
    </div>
  );
}
