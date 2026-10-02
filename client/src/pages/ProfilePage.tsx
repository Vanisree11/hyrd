import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api } from '../lib/api';
import { Profile } from '../types';
import { ErrorNote, PageHeader } from '../components/ui';

function Chips({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [t, setT] = useState('');
  const add = () => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setT(''); };
  return <div><div className="mb-2 flex flex-wrap gap-1.5">{value.map((s) => <span key={s} className="chip">{s}<button onClick={() => onChange(value.filter((x) => x !== s))}><X className="h-3 w-3 text-zinc-500 hover:text-red-400" /></button></span>)}</div>
    <div className="flex gap-2"><input className="input" value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} /><button type="button" onClick={add} className="btn-ghost"><Plus className="h-4 w-4" /></button></div></div>;
}
const Toggle = ({ opts, value, onChange }: { opts: string[]; value: string[]; onChange: (v: string[]) => void }) => <div className="flex flex-wrap gap-2">{opts.map((o) => <button key={o} type="button" onClick={() => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o])} className={`rounded-full border px-3 py-1 text-xs ${value.includes(o) ? 'border-hyrd bg-hyrd/15 text-hyrd' : 'border-ink-500 text-zinc-400'}`}>{o}</button>)}</div>;

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null); const [err, setErr] = useState(''); const [saved, setSaved] = useState(false);
  useEffect(() => { api('/profile').then(setP); }, []);
  if (!p) return <div className="text-zinc-500">Loading…</div>;
  const set = (patch: Partial<Profile>) => { setP({ ...p, ...patch }); setSaved(false); };
  const pref = (patch: Partial<Profile['preferences']>) => set({ preferences: { ...p.preferences, ...patch } });
  const edu = (patch: Partial<Profile['education']>) => set({ education: { ...p.education, ...patch } });
  const save = async () => { setErr(''); try { setP(await api('/profile', { method: 'PUT', body: p })); setSaved(true); } catch (e: any) { setErr(e.message); } };
  const F = ({ label, children }: any) => <div><label className="label">{label}</label>{children}</div>;
  return (
    <div className="space-y-6">
      <PageHeader title="Profile" sub="The agent only uses what's here — it never invents qualifications." right={<div className="flex items-center gap-3">{saved && <span className="text-sm text-emerald-400">Saved ✓</span>}<button onClick={save} className="btn-primary">Save profile</button></div>} />
      <ErrorNote msg={err} />
      <div className="card grid gap-4 p-5 sm:grid-cols-2"><h2 className="text-sm font-bold uppercase tracking-widest text-white sm:col-span-2">About you</h2>
        <F label="Name"><input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} /></F><F label="Email"><input className="input" value={p.email} onChange={(e) => set({ email: e.target.value })} /></F>
        <F label="Phone"><input className="input" value={p.phone} onChange={(e) => set({ phone: e.target.value })} /></F><F label="Summary"><input className="input" value={p.summary} onChange={(e) => set({ summary: e.target.value })} /></F></div>
      <div className="card grid gap-4 p-5 sm:grid-cols-2"><h2 className="text-sm font-bold uppercase tracking-widest text-white sm:col-span-2">Education</h2>
        <F label="Degree"><input className="input" value={p.education.degree} onChange={(e) => edu({ degree: e.target.value })} /></F><F label="Branch"><input className="input" value={p.education.branch} onChange={(e) => edu({ branch: e.target.value })} /></F>
        <F label="College"><input className="input" value={p.education.college} onChange={(e) => edu({ college: e.target.value })} /></F>
        <div className="grid grid-cols-2 gap-3"><F label="Graduation year"><input className="input" type="number" value={p.education.gradYear ?? ''} onChange={(e) => edu({ gradYear: e.target.value ? Number(e.target.value) : null })} /></F><F label="CGPA"><input className="input" value={p.education.cgpa} onChange={(e) => edu({ cgpa: e.target.value })} /></F></div></div>
      <div className="card space-y-4 p-5"><h2 className="text-sm font-bold uppercase tracking-widest text-white">Skills</h2><Chips value={p.skills} onChange={(skills) => set({ skills })} placeholder="Add a skill and press Enter" />
        <h2 className="pt-2 text-sm font-bold uppercase tracking-widest text-white">Certifications</h2><Chips value={p.certifications} onChange={(certifications) => set({ certifications })} placeholder="Add a certification" /></div>
      <div className="card space-y-3 p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-white">Projects</h2><button className="btn-ghost !py-1 !text-xs" onClick={() => set({ projects: [...p.projects, { name: '', description: '' }] })}><Plus className="h-3 w-3" />Add</button></div>
        {p.projects.map((pr, i) => <div key={i} className="grid gap-2 rounded-xl border border-ink-500 bg-ink-900 p-3"><div className="flex gap-2"><input className="input" placeholder="Project name" value={pr.name} onChange={(e) => set({ projects: p.projects.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} /><button onClick={() => set({ projects: p.projects.filter((_, j) => j !== i) })} className="btn-danger !px-2"><X className="h-4 w-4" /></button></div><textarea className="input" rows={2} placeholder="What you built (facts only)" value={pr.description} onChange={(e) => set({ projects: p.projects.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} /></div>)}</div>
      <div className="card space-y-4 p-5"><h2 className="text-sm font-bold uppercase tracking-widest text-white">Job preferences</h2>
        <F label="Preferred roles"><Chips value={p.preferences.roles} onChange={(roles) => pref({ roles })} placeholder="e.g. Software Engineer, Full Stack, AI/ML" /></F>
        <F label="Preferred locations"><Chips value={p.preferences.locations} onChange={(locations) => pref({ locations })} placeholder="e.g. Bangalore, India" /></F>
        <div className="grid gap-4 sm:grid-cols-2"><F label="Work mode"><Toggle opts={['Remote', 'Hybrid', 'Onsite']} value={p.preferences.workModes} onChange={(workModes) => pref({ workModes })} /></F><F label="Employment type"><Toggle opts={['Internship', 'Full-time', 'Part-time', 'Contract']} value={p.preferences.employmentTypes} onChange={(employmentTypes) => pref({ employmentTypes })} /></F></div>
        <div className="grid gap-4 sm:grid-cols-3"><F label="Years of experience"><input className="input" type="number" min={0} step={0.5} value={p.preferences.experienceYears} onChange={(e) => pref({ experienceYears: Number(e.target.value) })} /></F><F label="Salary / stipend preference"><input className="input" value={p.preferences.salaryPreference} onChange={(e) => pref({ salaryPreference: e.target.value })} /></F><F label="Other preferences"><input className="input" value={p.preferences.other} onChange={(e) => pref({ other: e.target.value })} /></F></div></div>
    </div>);
}
