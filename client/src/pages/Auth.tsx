import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Logo } from '../layouts/AppLayout';
import { ErrorNote } from '../components/ui';
import { ShieldCheck, Workflow, Bot } from 'lucide-react';

export default function Auth() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { mode === 'login' ? await login(f.email, f.password) : await register(f.name, f.email, f.password); } catch (x: any) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-ink-600 p-12 lg:flex">
        <div className="absolute -left-20 top-1/3 h-96 w-96 rounded-full bg-hyrd/20 blur-[120px]" />
        <Logo size="text-4xl" />
        <div className="relative"><h1 className="text-5xl font-black leading-tight text-white">Stop applying manually.<br /><span className="text-hyrd drop-shadow-[0_0_20px_rgba(255,106,0,.6)]">Let HYRD do the work.</span></h1>
          <p className="mt-4 max-w-md text-zinc-400">Your autonomous AI job application agent. It searches, matches, prepares — and always asks you before anything irreversible.</p></div>
        <div className="relative space-y-3 text-sm text-zinc-400">
          {[[Workflow, 'Plans, searches, matches and tracks end-to-end'], [Bot, 'Browser, API and MCP execution with automatic recovery'], [ShieldCheck, 'Human approval before every submission']].map(([I, t]: any) => <div key={t} className="flex items-center gap-3"><I className="h-4 w-4 text-hyrd" />{t}</div>)}</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-7">
          <div className="lg:hidden"><Logo /></div>
          <div><h2 className="text-xl font-bold text-white">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p className="text-sm text-zinc-500">Your Autonomous AI Job Application Agent</p></div>
          {mode === 'register' && <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>}
          <div><label className="label">Email</label><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
          <div><label className="label">Password</label><input className="input" type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />{mode === 'register' && <p className="mt-1 text-xs text-zinc-600">At least 8 characters</p>}</div>
          <ErrorNote msg={err} />
          <button disabled={busy} className="btn-primary w-full">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
          <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }} className="w-full text-center text-sm text-zinc-500 hover:text-hyrd">{mode === 'login' ? "New to HYRD? Create an account" : 'Already registered? Log in'}</button>
        </form>
      </div>
    </div>);
}
