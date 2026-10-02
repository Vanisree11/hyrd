import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, CheckSquare, Square } from 'lucide-react';
import { api } from '../lib/api';
import { useAgent } from '../hooks/useAgent';
import { Application } from '../types';
import { Badge, Empty, ErrorNote, PageHeader, ScoreRing } from '../components/ui';
import { ApplicationReview } from '../components/ApplicationReview';
import { ago } from '../lib/format';

const FILTERS = ['All', 'Awaiting Approval', 'Approved', 'Applying', 'Submitted', 'Interview', 'Withdrawn', 'Failed'];
export default function Applications() {
  const { tick } = useAgent();
  const [apps, setApps] = useState<Application[]>([]); const [filter, setFilter] = useState('All');
  const [picked, setPicked] = useState<Set<number>>(new Set()); const [openId, setOpenId] = useState<number | null>(null);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setApps(await api('/applications')), []);
  useEffect(() => { load().catch(() => {}); }, [load, tick]);
  const list = apps.filter((a) => filter === 'All' || a.status === filter);
  const pending = apps.filter((a) => a.status === 'Awaiting Approval');
  const open = apps.find((a) => a.id === openId) || null;
  const toggle = (id: number) => { const n = new Set(picked); n.has(id) ? n.delete(id) : n.add(id); setPicked(n); };
  const approveSelected = async () => { setBusy(true); setErr(''); try { const r = await api('/applications/approve-many', { body: { ids: [...picked] } }); const bad = r.results.filter((x: any) => !x.ok); if (bad.length) setErr(`${bad.length} could not be approved: ${bad[0].error}`); setPicked(new Set()); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <div>
      <PageHeader title="Applications" sub="Nothing is submitted until you approve it." />
      {pending.length > 0 && (
        <div className="card mb-6 border-hyrd/40 p-5 shadow-glow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-bold uppercase tracking-widest text-hyrd">Select applications</div><div className="text-xs text-zinc-500">{pending.length} waiting for human approval</div></div>
            <div className="flex gap-2"><button className="btn-ghost !text-xs" onClick={() => setPicked(picked.size === pending.length ? new Set() : new Set(pending.map((p) => p.id)))}>{picked.size === pending.length ? 'Clear' : 'Select all'}</button>
              <button disabled={!picked.size || busy} onClick={approveSelected} className="btn-primary !text-xs">Approve Selected Applications ({picked.size})</button></div></div>
          <ul className="space-y-1.5">{pending.map((a) => <li key={a.id} className="flex items-center gap-3 rounded-xl border border-ink-500 bg-ink-900 px-3 py-2">
            <button onClick={() => toggle(a.id)} className="text-hyrd">{picked.has(a.id) ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-zinc-600" />}</button>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{a.job.company} — {a.job.title}</div><div className="text-xs text-zinc-500">{a.job.match?.score}% match • {a.job.match?.eligibility}</div></div>
            <button onClick={() => setOpenId(a.id)} className="btn-ghost !py-1 !text-xs">Review</button></li>)}</ul>
          <p className="mt-3 text-xs text-zinc-600">Approving queues the application — you still press "Apply now" per application, and external sites need your final step.</p>
        </div>)}
      <ErrorNote msg={err} />
      <div className="mb-4 mt-2 flex flex-wrap gap-2">{FILTERS.map((s) => <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1 text-xs transition ${filter === s ? 'border-hyrd bg-hyrd/15 text-hyrd' : 'border-ink-500 text-zinc-400 hover:text-white'}`}>{s}{s !== 'All' && ` (${apps.filter((a) => a.status === s).length})`}</button>)}</div>
      {list.length === 0 ? <Empty icon={<ClipboardList className="h-8 w-8 text-zinc-600" />} title="No applications here" sub="Prepare an application from a job card, or let the agent prepare them for strong matches." /> :
        <div className="space-y-3">{list.map((a) => (
          <button key={a.id} onClick={() => setOpenId(a.id)} className="card card-hover flex w-full items-center gap-4 p-4 text-left">
            <ScoreRing score={a.job.match?.score || 0} size={44} /><div className="min-w-0 flex-1"><div className="truncate font-semibold text-white">{a.job.title}</div><div className="truncate text-sm text-zinc-500">{a.job.company} • {a.job.source.replace('_', ' ')}{a.executionMethod ? ` • via ${a.executionMethod}` : ''}</div></div>
            <div className="text-right"><Badge k={a.status}>{a.status}</Badge><div className="mt-1 text-xs text-zinc-600">{ago(a.updatedAt)}</div></div></button>))}</div>}
      {open && <ApplicationReview key={open.id + open.status + open.updatedAt} app={open} onClose={() => setOpenId(null)} onChange={load} />}
    </div>);
}
