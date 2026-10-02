import { useEffect, useState } from 'react';
import { ExternalLink, Plug } from 'lucide-react';
import { api } from '../lib/api';
import { Connector } from '../types';
import { Badge, ErrorNote, PageHeader } from '../components/ui';

export default function SettingsPage() {
  const [d, setD] = useState<{ connectors: Connector[]; ai: any; browser: any; demoMode: boolean } | null>(null); const [err, setErr] = useState('');
  const load = () => api('/connectors').then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const toggle = async (c: Connector) => { try { await api(`/connectors/${c.source}/connect`, { body: { enabled: !c.enabled } }); load(); } catch (e: any) { setErr(e.message); } };
  const token = async (c: Connector) => { const t = prompt(`Paste an authorized access token for ${c.label}. It is stored encrypted on the server. Note: HYRD ships no ${c.label} integration, so this only prepares a future authorized connector.`); if (t) { await api(`/connectors/${c.source}/connect`, { body: { credentials: { accessToken: t } } }); load(); } };
  return (
    <div>
      <PageHeader title="Settings" sub="Connected job sources, AI provider and browser automation." />
      <ErrorNote msg={err} />
      {d && <>
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="card p-5"><div className="text-xs uppercase tracking-wider text-zinc-500">AI provider</div><div className="mt-1 text-lg font-bold text-white capitalize">{d.ai.provider}</div><p className="mt-1 text-xs text-zinc-500">{d.ai.llmConfigured ? 'LLM enabled for cover letters, answers and explanations. Scores are always rule-based.' : 'No API key configured: using the deterministic engine (set AI_PROVIDER + key on the server for LLM writing).'}</p></div>
          <div className="card p-5"><div className="text-xs uppercase tracking-wider text-zinc-500">Browser automation (Playwright)</div><div className="mt-1 text-lg font-bold text-white">{d.browser.ok ? 'Ready' : 'Not active'}</div><p className="mt-1 text-xs text-zinc-500">{d.browser.reason}</p></div>
        </div>
        {d.demoMode && <div className="mb-4 rounded-xl border border-hyrd/40 bg-hyrd/10 px-3 py-2 text-sm text-hyrd-400">DEMO_MODE is on: a clearly-labelled mock source is included. Turn it off for real-only listings.</div>}
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-white">Job source connectors</h2>
        <div className="grid gap-4 md:grid-cols-2">{d.connectors.map((c) => (
          <div key={c.source} className="card p-5"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Plug className="h-4 w-4 text-hyrd" /><div><div className="font-semibold text-white">{c.label}</div><div className="text-xs capitalize text-zinc-500">{c.kind.replace('-', ' ')}</div></div></div><Badge k={c.status}>{c.status.replace(/_/g, ' ')}</Badge></div>
            <p className="mt-3 text-sm text-zinc-400">{c.description}</p><p className="mt-1 text-xs text-zinc-500">{c.message}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2"><button onClick={() => toggle(c)} className={c.enabled ? 'btn-ghost !py-1 !text-xs' : 'btn-primary !py-1 !text-xs'}>{c.enabled ? 'Disable' : 'Enable'}</button>
              {c.kind === 'platform' && <button onClick={() => token(c)} className="btn-ghost !py-1 !text-xs">{c.hasCredentials ? 'Update token' : 'Add credentials'}</button>}
              <a href={c.officialUrl} target="_blank" rel="noreferrer noopener" className="ml-auto flex items-center gap-1 text-xs text-hyrd hover:underline">Official site <ExternalLink className="h-3 w-3" /></a></div></div>))}</div></>}
    </div>);
}
