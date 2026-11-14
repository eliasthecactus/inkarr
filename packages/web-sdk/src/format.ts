export function formatBytes(n?: number | null): string {
  if (!n) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function relativeTime(ts?: number | string | null): string {
  if (!ts) return '—';
  const t = typeof ts === 'string' ? Date.parse(ts) : ts;
  if (!Number.isFinite(t)) return String(ts);
  const diff = (Date.now() - t) / 1000;
  const abs = Math.abs(diff);
  const fmt = (v: number, u: string) => `${Math.round(v)} ${u}${Math.round(v) === 1 ? '' : 's'}`;
  const s = abs < 60 ? 'just now' : abs < 3600 ? fmt(abs / 60, 'minute') : abs < 86400 ? fmt(abs / 3600, 'hour') : fmt(abs / 86400, 'day');
  if (s === 'just now') return s;
  return diff >= 0 ? `${s} ago` : `in ${s}`;
}

export function formatEta(sec?: number | null): string {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`;
}
