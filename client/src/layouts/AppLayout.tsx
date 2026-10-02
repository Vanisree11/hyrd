import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Search, Bot, ClipboardList, Activity, FileUser, UserRound, Settings, LogOut, Menu } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useAgent } from '../hooks/useAgent';
import { cx } from '../components/ui';

const nav = [
  ['/', 'Dashboard', LayoutDashboard], ['/jobs', 'Find Jobs', Search], ['/agent', 'AI Agent', Bot], ['/applications', 'Applications', ClipboardList],
  ['/activity', 'Activity', Activity], ['/resume', 'Resume', FileUser], ['/profile', 'Profile', UserRound], ['/settings', 'Settings', Settings],
] as const;

export const Logo = ({ size = 'text-2xl' }: { size?: string }) => <div className={cx('font-black tracking-[0.2em] text-white', size)}>HYR<span className="text-hyrd drop-shadow-[0_0_10px_rgba(255,106,0,.8)]">D</span></div>;

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { running } = useAgent();
  const [open, setOpen] = useState(false);
  const side = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-6 pt-6"><Logo /><div className="mt-1 text-[10px] uppercase tracking-widest text-zinc-600">Autonomous job agent</div></div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', isActive ? 'bg-hyrd/15 text-hyrd shadow-glow-sm' : 'text-zinc-400 hover:bg-ink-700 hover:text-white')}>
            <Icon className="h-4 w-4" />{label}{label === 'AI Agent' && running && <span className="ml-auto h-2 w-2 rounded-full bg-hyrd animate-pulseRing" />}
          </NavLink>))}
      </nav>
      <div className="border-t border-ink-600 p-4"><div className="truncate text-sm font-medium text-white">{user?.name}</div><div className="truncate text-xs text-zinc-500">{user?.email}</div>
        <button onClick={logout} className="mt-3 flex items-center gap-2 text-xs text-zinc-500 hover:text-hyrd"><LogOut className="h-3.5 w-3.5" />Log out</button></div>
    </div>);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-ink-600 bg-black/60 backdrop-blur lg:block">{side}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} /><aside className="absolute left-0 top-0 h-full w-64 border-r border-ink-600 bg-ink-950">{side}</aside></div>}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-600 bg-black/70 px-4 py-3 backdrop-blur lg:hidden"><button onClick={() => setOpen(true)}><Menu className="h-5 w-5 text-zinc-300" /></button><Logo size="text-lg" /></header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>);
}
