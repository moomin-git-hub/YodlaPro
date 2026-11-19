import { useEffect, useState } from 'react';
import { Copy, Sparkles, Trash2, RefreshCw } from 'lucide-react';
import { api, cloudEnabled, getToken } from '../lib/api';
import { useT } from '../lib/i18n';
import { Button, confirmDialog, toast } from './ui';

/**
 * Profile card: a personal Claude connector link (remote MCP server). Pasted into Claude as a custom connector,
 * it lets the user add cards, get quizzed and see stats from any Claude chat. The link is shown once.
 */
export function ClaudeCard() {
  const { t, locale } = useT();
  const [st, setSt] = useState<{ active: boolean; createdAt: number | null } | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api<{ active: boolean; createdAt: number | null }>('/claude').then(setSt).catch(() => setSt(null));
  useEffect(() => { if (cloudEnabled && getToken()) load(); }, []);
  if (!st) return null;
  const copy = async (u: string) => { try { await navigator.clipboard.writeText(u); toast(t('claudeCopied')); } catch { /* the field below can be copied by hand */ } };
  const create = async () => {
    if (st.active && !(await confirmDialog(t('claudeNewWarn'), { ok: t('claudeNew'), cancel: t('cancel') }))) return;
    setBusy(true);
    try { const r = await api<{ url: string }>('/claude', { method: 'POST' }); setUrl(r.url); copy(r.url); load(); }
    catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(false); }
  };
  return (
    <section className="card-surface space-y-3 rounded-3xl p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-orange-500/15 text-orange-500"><Sparkles size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Claude</p>
          <p className="truncate text-xs opacity-60">{st.active && st.createdAt ? t('claudeActive', { n: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(st.createdAt) }) : t('claudeDesc')}</p>
        </div>
        {st.active && !url
          ? <Button size="sm" variant="soft" icon={<RefreshCw size={14} />} loading={busy} onClick={create}>{t('claudeNew')}</Button>
          : !url && <Button size="sm" icon={<Sparkles size={14} />} loading={busy} onClick={create}>{t('claudeCreate')}</Button>}
      </div>
      {url && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input readOnly className="input font-mono text-xs" value={url} onFocus={(e) => e.target.select()} aria-label="Claude connector URL" />
            <Button size="sm" variant="soft" icon={<Copy size={14} />} onClick={() => copy(url)}>{''}</Button>
          </div>
          <p className="text-xs leading-relaxed opacity-60">{t('claudeHow')}</p>
        </div>
      )}
      {st.active && (
        <button type="button" className="flex items-center gap-1.5 text-xs font-semibold text-rose-500" onClick={async () => { await api('/claude', { method: 'DELETE' }); setUrl(''); toast(t('saved')); load(); }}>
          <Trash2 size={13} />{t('claudeRevoke')}
        </button>
      )}
      {!url && !st.active && <p className="text-xs leading-relaxed opacity-55">{t('claudeHow')}</p>}
    </section>
  );
}
