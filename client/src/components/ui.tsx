import { ReactNode } from 'react';
import { Check, Loader2, AlertTriangle, Circle, MinusCircle, Hourglass } from 'lucide-react';
export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ');

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>{sub && <p className="mt-1 text-sm text-zinc-500">{sub}</p>}</div>{right}</div>;
}
export function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return <div className="card p-4"><div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div><div className="mt-1 text-3xl font-extrabold text-white">{value}</div>{hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}</div>;
}
const tone: Record<string, string> = {
  Eligible: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10', 'Potentially Eligible': 'border-hyrd/40 text-hyrd bg-hyrd/10', 'Not Eligible': 'border-red-500/40 text-red-400 bg-red-500/10', 'Needs Review': 'border-hyrd/40 text-hyrd bg-hyrd/10', Unknown: 'border-zinc-600 text-zinc-400 bg-zinc-500/10',
  Submitted: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10', Interview: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10', Offer: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/15',
  'Awaiting Approval': 'border-hyrd/50 text-hyrd bg-hyrd/10', Approved: 'border-sky-500/40 text-sky-400 bg-sky-500/10', Applying: 'border-sky-500/40 text-sky-400 bg-sky-500/10',
  Failed: 'border-red-500/40 text-red-400 bg-red-500/10', Rejected: 'border-red-500/40 text-red-400 bg-red-500/10', Withdrawn: 'border-zinc-600 text-zinc-400 bg-zinc-500/10',
  connected: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10', available: 'border-sky-500/40 text-sky-400 bg-sky-500/10', unsupported: 'border-zinc-600 text-zinc-400 bg-zinc-500/10', no_results: 'border-zinc-600 text-zinc-400 bg-zinc-500/10',
  authentication_required: 'border-hyrd/40 text-hyrd bg-hyrd/10', rate_limited: 'border-hyrd/40 text-hyrd bg-hyrd/10', failed: 'border-red-500/40 text-red-400 bg-red-500/10',
};
export const Badge = ({ children, k }: { children: ReactNode; k?: string }) => <span className={cx('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium', tone[k || String(children)] || 'border-ink-500 text-zinc-300 bg-ink-700')}>{children}</span>;

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = size / 2 - 5, c = 2 * Math.PI * r;
  const col = score >= 80 ? '#34d399' : score >= 60 ? '#ff6a00' : '#71717a';
  return <div className="relative shrink-0" style={{ width: size, height: size }}>
    <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} stroke="#2e2e2e" strokeWidth="4" fill="none" /><circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ filter: `drop-shadow(0 0 4px ${col}88)`, transition: 'stroke-dashoffset .8s' }} /></svg>
    <div className="absolute inset-0 grid place-items-center text-sm font-bold text-white">{score}%</div></div>;
}
export function TaskIcon({ s }: { s: string }) {
  if (s === 'done') return <Check className="h-4 w-4 text-emerald-400" />;
  if (s === 'running') return <Loader2 className="h-4 w-4 animate-spin text-hyrd" />;
  if (s === 'failed') return <AlertTriangle className="h-4 w-4 text-red-400" />;
  if (s === 'waiting') return <Hourglass className="h-4 w-4 text-hyrd animate-pulse" />;
  if (s === 'skipped') return <MinusCircle className="h-4 w-4 text-zinc-600" />;
  return <Circle className="h-4 w-4 text-zinc-700" />;
}
export const Empty = ({ icon, title, sub, action }: { icon?: ReactNode; title: string; sub?: string; action?: ReactNode }) => <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">{icon}<div className="text-base font-semibold text-white">{title}</div>{sub && <div className="max-w-md text-sm text-zinc-500">{sub}</div>}{action && <div className="mt-2">{action}</div>}</div>;
export const ErrorNote = ({ msg }: { msg: string }) => msg ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{msg}</div> : null;
export const SourceTag = ({ job }: { job: { source: string; alsoOn: string[]; isDemo: boolean } }) => <span className="chip">{job.isDemo ? 'DEMO' : job.source.replace('_', ' ')}{job.alsoOn?.length ? ` +${job.alsoOn.length}` : ''}</span>;
