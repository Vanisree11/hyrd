import { useCallback, useEffect, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { api } from '../lib/api';
import { useAgent } from '../hooks/useAgent';
import { Job } from '../types';
import { JobCard } from '../components/JobCard';
import { Empty, ErrorNote, PageHeader } from '../components/ui';
import { Link } from 'react-router-dom';

const SOURCES = ['adzuna', 'remotive', 'arbeitnow', 'remoteok', 'company_careers', 'linkedin', 'naukri', 'indeed', 'internshala', 'demo'];
export default function FindJobs() {
  const { tick } = useAgent();
  const [f, setF] = useState({ q: '', minMatch: '0', company: '', location: '', workMode: '', type: '', source: '', postedWithinDays: '', eligibility: '', sort: 'best' });
  const [data, setData] = useState<{ total: number; jobs: Job[] }>({ total: 0, jobs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const p = new URLSearchParams(); Object.entries(f).forEach(([k, v]) => v && v !== '0' && p.set(k, v)); p.set('limit', '100');
    setError(''); setLoading(true);
    try { setData(await api(`/jobs?${p}`)); }
    catch (e: any) { setError(e.message || 'Could not load jobs. Check the HYRD backend.'); }
    finally { setLoading(false); }
  }, [f]);
  useEffect(() => { const t = setTimeout(() => load().catch(() => setLoading(false)), 250); return () => clearTimeout(t); }, [load, tick]);
  const sel = (k: keyof typeof f, label: string, opts: [string, string][]) => <div><label className="label">{label}</label><select className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>;
  return (
    <div>
      <PageHeader title="Find Jobs" sub={`${data.total} real listings fetched by the agent from connected sources`} />
      <ErrorNote msg={error} />
      <div className="card mb-6 p-4"><div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-zinc-500"><SlidersHorizontal className="h-3 w-3" />Filters</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><label className="label">Role</label><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-600" /><input className="input !pl-9" placeholder="e.g. Intern, Frontend" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></div></div>
          <div><label className="label">Company</label><input className="input" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
          <div><label className="label">Location</label><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
          {sel('minMatch', 'Min match', [['0', 'Any'], ['50', '50%+'], ['70', '70%+'], ['80', '80%+'], ['90', '90%+']])}
          {sel('workMode', 'Work mode', [['', 'Any'], ['Remote', 'Remote'], ['Hybrid', 'Hybrid'], ['Onsite', 'Onsite']])}
          {sel('type', 'Type', [['', 'Any'], ['Internship', 'Internship'], ['Full-time', 'Full-time'], ['Part-time', 'Part-time'], ['Contract', 'Contract']])}
          {sel('source', 'Source', [['', 'All sources'], ...SOURCES.map((s) => [s, s.replace('_', ' ')] as [string, string])])}
          {sel('postedWithinDays', 'Posted', [['', 'Any time'], ['1', 'Last 24h'], ['7', 'Last 7 days'], ['30', 'Last 30 days']])}
          {sel('eligibility', 'Eligibility', [['', 'Any'], ['Eligible', 'Eligible'], ['Potentially Eligible', 'Potentially'], ['Needs Review', 'Needs review'], ['Unknown', 'Unknown'], ['Not Eligible', 'Not eligible']])}
          {sel('sort', 'Sort by', [['best', 'Best match'], ['newest', 'Newest'], ['company', 'Company'], ['role', 'Role']])}
        </div></div>
      {loading ? <div className="text-zinc-500">Loading…</div> : data.jobs.length === 0 ?
        <Empty title="No jobs yet" sub="Jobs are fetched live by the agent from connected sources. Run the agent to populate this list." action={<Link to="/agent" className="btn-primary">Go to AI Agent</Link>} /> :
        <div className="grid gap-4 xl:grid-cols-2">{data.jobs.map((j) => <JobCard key={j.id} job={j} onChange={load} />)}</div>}
    </div>);
}
