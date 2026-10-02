import { useState } from 'react';
import { ExternalLink, MapPin, Clock, Briefcase, Sparkles, ChevronDown } from 'lucide-react';
import { Job } from '../types';
import { Badge, ScoreRing, SourceTag, cx } from './ui';
import { ago } from '../lib/format';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export function JobCard({ job, onChange }: { job: Job; onChange?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const nav = useNavigate();
  const m = job.match;
  const prepare = async () => {
    setBusy(true); setErr('');
    try { await api('/applications/prepare', { body: { jobId: job.id } }); onChange?.(); nav('/applications'); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card card-hover animate-fadeUp p-5">
      <div className="flex items-start gap-4">
        {m && <ScoreRing score={m.score} />}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-white">{job.title}</h3>
          <div className="text-sm text-hyrd-400">{job.company}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location || 'Unknown'}{job.workMode !== 'Unknown' && ` / ${job.workMode}`}</span>
            <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{job.employmentType}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{ago(job.postedDate)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">{m && <Badge>{m.eligibility}</Badge>}<SourceTag job={job} /></div>
      </div>
      {m && (m.matchedSkills.length > 0 || m.missingSkills.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {m.matchedSkills.slice(0, 8).map((s) => <span key={s} className="chip border-emerald-500/30 text-emerald-400">{s} ✓</span>)}
          {m.missingSkills.slice(0, 4).map((s) => <span key={s} className="chip text-zinc-500">{s} ✗</span>)}
        </div>)}
      {m?.explanation && <p className="mt-3 flex gap-2 text-xs text-zinc-400"><Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-hyrd" />{m.explanation}</p>}
      {open && m && (
        <div className="mt-3 space-y-3 rounded-xl border border-ink-500 bg-ink-900 p-3 text-xs">
          <div className="grid grid-cols-5 gap-2 text-center">{[['Skills', 'skills', 40], ['Eligibility', 'eligibility', 25], ['Role', 'role', 15], ['Experience', 'experience', 10], ['Location', 'location', 10]].map(([l, k, max]) => (
            <div key={k as string}><div className="text-sm font-bold text-white">{m.breakdown[k as string]}<span className="text-zinc-600">/{max}</span></div><div className="text-[10px] uppercase tracking-wider text-zinc-500">{l}</div></div>))}</div>
          <ul className="space-y-1 text-zinc-400">{m.eligibilityNotes.map((n, i) => <li key={i}>• {n}</li>)}</ul>
          <p className="max-h-40 overflow-y-auto whitespace-pre-line text-zinc-500">{job.description?.slice(0, 1500)}{(job.description?.length || 0) > 1500 ? '…' : ''}</p>
        </div>)}
      {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a href={job.applicationUrl} target="_blank" rel="noreferrer noopener" className="btn-ghost !py-1.5 !text-xs">View Job <ExternalLink className="h-3 w-3" /></a>
        {job.application ? <Badge k={job.application.status}>{job.application.status}</Badge> :
          <button disabled={busy || m?.eligibility === 'Not Eligible'} onClick={prepare} className="btn-primary !py-1.5 !text-xs" title={m?.eligibility === 'Not Eligible' ? 'Requirements not met' : ''}>{busy ? 'Preparing…' : 'Prepare Application'}</button>}
        <button onClick={() => setOpen(!open)} className="ml-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-white">Why this score <ChevronDown className={cx('h-3 w-3 transition', open && 'rotate-180')} /></button>
      </div>
    </div>
  );
}
