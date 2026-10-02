import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useAgent } from '../hooks/useAgent';
import { greeting, ago } from '../lib/format';
import { AgentPanel } from '../components/AgentPanel';
import { GoalBox } from '../components/GoalBox';
import { Badge, ScoreRing, Stat, Empty } from '../components/ui';
import { Application, Job } from '../types';

export default function Dashboard() {
  const { user } = useAuth(); const { tick } = useAgent();
  const [stats, setStats] = useState<any>(null); const [jobs, setJobs] = useState<Job[]>([]); const [apps, setApps] = useState<Application[]>([]);
  const load = useCallback(async () => {
    const [s, j, a] = await Promise.all([api('/stats'), api('/jobs?sort=best&limit=5&minMatch=1'), api('/applications')]);
    setStats(s); setJobs(j.jobs); setApps(a.slice(0, 5));
  }, []);
  useEffect(() => { load().catch(() => {}); }, [load, tick]);
  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-hyrd/20 blur-[100px]" />
        <div className="relative grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2"><div className="text-sm text-zinc-500">{greeting()}, {user?.name.split(' ')[0]}.</div>
            <h1 className="mt-1 text-3xl font-black leading-tight text-white sm:text-4xl">Stop applying manually.<br /><span className="text-hyrd">Let HYRD do the work.</span></h1>
            <p className="mt-2 text-sm text-zinc-400">HYRD is ready to work for you.</p></div>
          <div className="lg:col-span-3"><GoalBox big /></div>
        </div>
      </section>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Jobs Found" value={stats?.jobsFound ?? '–'} /><Stat label="Matching Jobs" value={stats?.matchingJobs ?? '–'} hint="≥70% & eligible" />
        <Stat label="Awaiting Approval" value={stats?.awaitingApproval ?? '–'} /><Stat label="Applications Submitted" value={stats?.submitted ?? '–'} />
      </section>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3"><AgentPanel /></div>
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-white">Top Matching Jobs</h2><Link to="/jobs" className="text-xs text-hyrd hover:underline">View all</Link></div>
            {jobs.length === 0 ? <p className="py-4 text-sm text-zinc-500">No jobs yet — start the agent.</p> : <ul className="space-y-3">{jobs.map((j) => <li key={j.id} className="flex items-center gap-3"><ScoreRing score={j.match?.score || 0} size={40} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-white">{j.title}</div><div className="truncate text-xs text-zinc-500">{j.company} • {j.source.replace('_', ' ')}</div></div></li>)}</ul>}</div>
          <div className="card p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold uppercase tracking-widest text-white">Recent Applications</h2><Link to="/applications" className="text-xs text-hyrd hover:underline">View all</Link></div>
            {apps.length === 0 ? <p className="py-4 text-sm text-zinc-500">Nothing prepared yet.</p> : <ul className="space-y-3">{apps.map((a) => <li key={a.id} className="flex items-center justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-medium text-white">{a.job.company}</div><div className="truncate text-xs text-zinc-500">{a.job.title} • {ago(a.updatedAt)}</div></div><Badge k={a.status}>{a.status}</Badge></li>)}</ul>}</div>
        </div>
      </div>
    </div>);
}
