import { useEffect, useRef, useState } from 'react';
import { UploadCloud, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { ErrorNote, PageHeader } from '../components/ui';
import { ago } from '../lib/format';
import { Link } from 'react-router-dom';

export default function ResumePage() {
  const [resume, setResume] = useState<any>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState('');
  const [drag, setDrag] = useState(false); const input = useRef<HTMLInputElement>(null);
  const load = () => api('/resume').then(setResume).catch(() => {});
  useEffect(() => { load(); }, []);
  const upload = async (file?: File) => {
    if (!file) return; setBusy(true); setErr(''); setOk('');
    try { const f = new FormData(); f.append('resume', file); const r = await api('/resume/upload', { form: f }); setOk(`Analyzed ${r.filename}: found ${r.profile.skills.length} skills. Review them in Profile.`); await load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const p = resume?.parsed;
  return (
    <div>
      <PageHeader title="Resume" sub="Upload a PDF or DOCX. HYRD extracts a structured profile — you can edit everything." />
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }} onClick={() => input.current?.click()}
        className={`card mb-6 flex cursor-pointer flex-col items-center gap-2 border-dashed px-6 py-12 text-center transition ${drag ? 'border-hyrd bg-hyrd/10 shadow-glow' : 'hover:border-hyrd/50'}`}>
        <input ref={input} type="file" hidden accept=".pdf,.docx" onChange={(e) => upload(e.target.files?.[0])} />
        {busy ? <Loader2 className="h-8 w-8 animate-spin text-hyrd" /> : <UploadCloud className="h-8 w-8 text-hyrd" />}
        <div className="font-semibold text-white">{busy ? 'Reading your resume…' : 'Drop your resume here or click to upload'}</div><div className="text-xs text-zinc-500">PDF or DOCX • max 5 MB • text-based files only</div>
      </div>
      <ErrorNote msg={err} />{ok && <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"><CheckCircle2 className="h-4 w-4" />{ok} <Link to="/profile" className="underline">Open Profile</Link></div>}
      {resume && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5"><div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white"><FileText className="h-4 w-4 text-hyrd" />{resume.filename}</div><div className="mb-3 text-xs text-zinc-500">Uploaded {ago(resume.uploadedAt)}</div>
            <dl className="space-y-2 text-sm">{[['Name', p?.name], ['Email', p?.email], ['Degree', p?.education?.degree], ['Branch', p?.education?.branch], ['College', p?.education?.college], ['Graduation', p?.education?.gradYear], ['CGPA', p?.education?.cgpa]].map(([k, v]) => <div key={k as string} className="flex justify-between gap-3"><dt className="text-zinc-500">{k}</dt><dd className="text-right text-zinc-200">{v || <span className="text-zinc-600">not found</span>}</dd></div>)}</dl>
            <div className="mt-3 flex flex-wrap gap-1.5">{p?.skills?.map((s: string) => <span key={s} className="chip">{s}</span>)}</div></div>
          <div className="card p-5"><div className="mb-3 text-sm font-bold uppercase tracking-widest text-white">Extracted text</div><pre className="max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs text-zinc-400">{resume.text}</pre></div>
        </div>)}
    </div>);
}
