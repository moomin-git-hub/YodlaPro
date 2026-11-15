import { useEffect, useState } from 'react';
import { Send, Unlink } from 'lucide-react';
import { api, cloudEnabled, getToken } from '../lib/api';
import { useT } from '../lib/i18n';
import { Button, toast } from './ui';

/** Profile card: connect the account to @yodlaPro_bot (study, reminders, reports in Telegram). */
export function TelegramCard() {
  const { t } = useT();
  const [st, setSt] = useState<{ enabled: boolean; bot: string; linked: boolean; name: string } | null>(null);
  const load = () => api<typeof st>('/telegram/status').then(setSt).catch(() => setSt(null));
  useEffect(() => {
    if (!cloudEnabled || !getToken()) return;
    load();
    const on = () => document.visibilityState === 'visible' && load(); // back from Telegram after linking
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  if (!st?.enabled) return null;
  return (
    <section className="card-surface flex items-center gap-3 rounded-3xl p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-500/15 text-sky-500"><Send size={20} /></span>
      <div className="min-w-0 flex-1">
        <p className="font-bold">Telegram · @{st.bot}</p>
        <p className="truncate text-xs opacity-60">{st.linked ? t('tgLinked', { n: st.name || '✓' }) : t('tgDesc')}</p>
      </div>
      {st.linked ? (
        <Button size="sm" variant="soft" icon={<Unlink size={14} />} onClick={async () => { await api('/telegram/link', { method: 'DELETE' }); toast(t('saved')); load(); }}>{t('tgUnlink')}</Button>
      ) : (
        <Button size="sm" icon={<Send size={14} />} onClick={async () => {
          const w = window.open('', '_blank'); // open synchronously so pop-up blockers allow it
          try { const r = await api<{ url: string }>('/telegram/link', { method: 'POST' }); if (w) w.location.href = r.url; else location.href = r.url; }
          catch (e) { w?.close(); toast((e as Error).message, 'err'); }
        }}>{t('tgConnect')}</Button>
      )}
    </section>
  );
}

/** Downloads a study report from the server: pdf (overview), xlsx (all cards), docx (hard-words notebook). */
export async function downloadReport(fmt: 'pdf' | 'xlsx' | 'docx', period: 'week' | 'month' = 'week') {
  const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
  const res = await fetch(`${base}/api/reports/${fmt}?period=${period}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `yodla.${fmt}`;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
