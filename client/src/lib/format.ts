export function ago(iso?: string | null) {
  if (!iso) return 'Unknown';
  const t = new Date(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T') + 'Z').getTime();
  if (isNaN(t)) return 'Unknown';
  const d = (Date.now() - t) / 1000;
  if (d < 90) return 'just now'; if (d < 3600) return `${Math.floor(d / 60)}m ago`; if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  const days = Math.floor(d / 86400); return days === 1 ? '1 day ago' : days < 60 ? `${days} days ago` : `${Math.floor(days / 30)} months ago`;
}
export const clock = (iso: string) => new Date(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T') + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const scoreColor = (s: number) => (s >= 80 ? 'text-emerald-400' : s >= 60 ? 'text-hyrd' : 'text-zinc-400');
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
