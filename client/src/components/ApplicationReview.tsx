import { useState } from 'react';
import { ExternalLink, FileText, ShieldCheck, History, X, AlertCircle } from 'lucide-react';
import { Application } from '../types';
import { api } from '../lib/api';
import { Badge, ErrorNote, ScoreRing, cx } from './ui';
import { clock } from '../lib/format';

export function ApplicationReview({ app, onClose, onChange }: { app: Application; onClose: () => void; onChange: () => void }) {
  const [cover, setCover] = useState(app.coverLetter);
  const [answers, setAnswers] = useState(app.answers.map((a) => ({ ...a })));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [hist, setHist] = useState<any[] | null>(null);
  const editable = ['Prepared', 'Awaiting Approval', 'Approved'].includes(app.status);
  const dirty = cover !== app.coverLetter || answers.some((a, i) => a.answer !== app.answers[i].answer);
  const act = async (name: string, fn: () => Promise<any>) => { setBusy(name); setErr(''); try { await fn(); onChange(); } catch (e: any) { setErr(e.message); } finally { setBusy(''); } };
  const save = () => act('save', () => api(`/applications/${app.id}`, { method: 'PUT', body: { coverLetter: cover, answers: answers.map((a) => ({ id: a.id, answer: a.answer })) } }));
  const loadHist = async () => setHist(await api(`/applications/${app.id}/history`));
  const m = app.job.match;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-ink-500 bg-ink-900 p-6 animate-fadeUp" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><div className="text-xs font-bold uppercase tracking-widest text-hyrd">Application review</div><h2 className="mt-1 text-xl font-bold text-white">{app.job.title}</h2><div className="text-sm text-zinc-400">{app.job.company} • {app.job.location}</div></div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-ink-600 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-5 flex items-center gap-4 rounded-xl border border-ink-500 bg-ink-800 p-3">
          {m && <ScoreRing score={m.score} size={52} />}<div className="flex-1 text-sm"><div className="flex flex-wrap gap-2"><Badge k={app.status}>{app.status}</Badge>{m && <Badge>{m.eligibility}</Badge>}{app.job.isDemo && <Badge k="Withdrawn">DEMO job</Badge>}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500"><FileText className="h-3 w-3" />Resume: {app.resume?.filename || <span className="text-hyrd">none uploaded — upload one in Resume</span>}</div></div>
        </div>
        {app.humanActionRequired && <div className="mb-5 flex gap-2 rounded-xl border border-hyrd/40 bg-hyrd/10 p-3 text-sm text-hyrd-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-semibold">Human action required</div><div className="text-zinc-300">{app.humanActionRequired}</div></div></div>}
        <div className="space-y-5">
          <div><label className="label">Cover letter</label><textarea disabled={!editable} value={cover} onChange={(e) => setCover(e.target.value)} rows={10} className="input font-sans leading-relaxed disabled:opacity-60" /></div>
          <div><label className="label">Application answers</label><div className="space-y-3">{answers.map((a, i) => (
            <div key={a.id}><div className="mb-1 text-sm font-medium text-zinc-300">{a.question}</div><textarea disabled={!editable} value={a.answer} onChange={(e) => setAnswers(answers.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} rows={3} className="input disabled:opacity-60" /></div>))}</div></div>
          <div className="flex items-center gap-2 text-xs text-zinc-500"><ExternalLink className="h-3 w-3" /><a className="truncate text-hyrd-400 hover:underline" href={app.job.applicationUrl} target="_blank" rel="noreferrer noopener">{app.job.applicationUrl}</a></div>
        </div>
        <ErrorNote msg={err} />
        <div className="sticky bottom-0 -mx-6 mt-6 flex flex-wrap items-center gap-2 border-t border-ink-600 bg-ink-900/95 px-6 py-4 backdrop-blur">
          {editable && dirty && <button disabled={!!busy} onClick={save} className="btn-ghost">{busy === 'save' ? 'Saving…' : 'Save edits'}</button>}
          {['Awaiting Approval', 'Prepared'].includes(app.status) && <><button disabled={!!busy || dirty} onClick={() => act('approve', () => api(`/applications/${app.id}/approve`, { method: 'POST' }))} className="btn-primary"><ShieldCheck className="h-4 w-4" />Approve</button>
            <button disabled={!!busy} onClick={() => act('reject', () => api(`/applications/${app.id}/reject`, { method: 'POST' }))} className="btn-danger">Reject</button></>}
          {app.status === 'Approved' && <button disabled={!!busy || dirty} onClick={() => act('exec', () => api(`/applications/${app.id}/execute`, { method: 'POST', body: {} }))} className="btn-primary">{busy === 'exec' ? 'Applying…' : 'Apply now'}</button>}
          {app.status === 'Applying' && <>
            {app.executionMethod === 'Browser' && !app.humanActionRequired?.includes('Unexpected') && <button disabled={!!busy} onClick={() => act('confirm', () => api(`/applications/${app.id}/execute`, { method: 'POST', body: { confirmSubmit: true } }))} className="btn-primary">Confirm final submit</button>}
            <a href={app.job.applicationUrl} target="_blank" rel="noreferrer noopener" className="btn-ghost">Open official page <ExternalLink className="h-3 w-3" /></a>
            <button disabled={!!busy} onClick={() => act('mark', () => api(`/applications/${app.id}/mark-submitted`, { method: 'POST' }))} className="btn-primary">I submitted it</button></>}
          {['Submitted', 'Under Review', 'Interview'].includes(app.status) && ['Under Review', 'Interview', 'Offer', 'Rejected'].map((s) => s !== app.status && <button key={s} disabled={!!busy} onClick={() => act(s, () => api(`/applications/${app.id}/status`, { body: { status: s } }))} className="btn-ghost !text-xs">Mark {s}</button>)}
          {dirty && <span className="text-xs text-zinc-500">Save edits before approving</span>}
          <button onClick={loadHist} className="btn-ghost ml-auto !text-xs"><History className="h-3 w-3" />History</button>
        </div>
        {hist && <ol className="mt-4 space-y-3 border-l border-ink-500 pl-4">{hist.map((h, i) => <li key={i} className="relative"><span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-hyrd shadow-glow-sm" /><div className="text-xs text-zinc-500">{clock(h.createdAt)}</div><div className="text-sm text-zinc-200"><span className="font-semibold text-white">{h.status}</span> — {h.message}</div></li>)}</ol>}
      </div>
    </div>
  );
}
