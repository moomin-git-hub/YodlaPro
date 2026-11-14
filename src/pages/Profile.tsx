import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ChevronRight, Moon, Globe, Target, Bell, Download, Upload, Trash2, KeyRound, LogOut, Keyboard, Info, Cloud, HardDrive, RefreshCw, Pencil, UserPlus, Volume2, Shuffle, CalendarPlus } from 'lucide-react';
import { useData, updateSettings, exportBackup, importBackup, wipeData, syncState, syncNow } from '../lib/store';
import { useT, LANGS } from '../lib/i18n';
import { getUser, signOut, changePassword, updateName, upgradeGuest, validatePassword } from '../lib/auth';
import { download, readFileText, isEmail } from '../lib/util';
import { Button, Field, PageHeader, Segmented, Sheet, Toggle, confirmDialog, toast } from '../components/ui';
import { RecoveryCodeScreen } from './Auth';
import type { Key } from '../lib/i18n';
import type { Theme } from '../lib/types';

export function Profile() {
  const d = useData();
  const s = d.settings;
  const { t } = useT();
  const user = getUser()!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [upOpen, setUpOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [, force] = useState(0);

  const toggleReminder = async (on: boolean) => {
    if (on && 'Notification' in window) {
      const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (p === 'denied') toast(t('notifDenied'), 'err');
    }
    updateSettings({ reminderEnabled: on });
  };
  const ics = () => {
    const [h, m] = s.reminderTime.split(':');
    const dt = new Date(); const ymd = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Yodla//EN', 'BEGIN:VEVENT', `UID:yodla-daily-${user.id}`, `DTSTAMP:${ymd}T000000`, `DTSTART:${ymd}T${h}${m}00`, 'DURATION:PT15M', 'RRULE:FREQ=DAILY',
      `SUMMARY:${t('studyReminderTitle')}`, `DESCRIPTION:Yodla — ${t('dailyGoal')}: ${s.dailyGoal}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', `DESCRIPTION:${t('studyReminderTitle')}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    download('yodla-reminder.ics', body, 'text/calendar');
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('profile')} sub={t('profileSub')} />
      <section className="card-surface flex items-center gap-4 rounded-[28px] p-5">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-2xl font-extrabold text-white">{(user.name || '?')[0].toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <button onClick={() => setNameOpen(true)} className="flex items-center gap-1.5 text-lg font-extrabold">{user.name}<Pencil size={14} className="opacity-40" /></button>
          {user.email && <p className="truncate text-sm opacity-60">{user.email}</p>}
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-ink-900/5 px-2.5 py-0.5 text-[11px] font-bold dark:bg-white/10">
            {user.mode === 'cloud' ? <Cloud size={12} /> : <HardDrive size={12} />}{user.guest ? t('guestMode') : user.mode === 'cloud' ? t('cloudMode') : t('localMode')}
          </p>
        </div>
      </section>
      {user.mode === 'cloud' && (
        <div className="flex items-center justify-between rounded-2xl bg-ink-900/[.04] px-4 py-3 text-sm dark:bg-white/5">
          <span className="font-semibold">{syncState.error ? `⚠ ${syncState.error}` : syncState.pending ? t('syncPending', { n: syncState.pending }) : t('synced')}</span>
          <Button size="sm" variant="soft" icon={<RefreshCw size={14} className={syncState.syncing ? 'animate-spin' : ''} />} onClick={async () => { await syncNow(); force((x) => x + 1); }}>{t('syncNow')}</Button>
        </div>
      )}
      {user.guest && <Button block icon={<UserPlus size={18} />} onClick={() => setUpOpen(true)}>{t('createAccount')}</Button>}

      <Link to="/stats" className="card-surface flex items-center gap-3 rounded-3xl p-4 lg:hidden">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-500/10 text-brand-500"><BarChart3 size={20} /></span>
        <span className="flex-1 font-bold">{t('stats')}</span><ChevronRight className="opacity-30" />
      </Link>

      <Group title={t('appearance')}>
        <Row icon={<Moon size={18} />} label={t('theme')}>
          <div className="w-52"><Segmented<Theme> value={s.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: 'light', label: t('light') }, { value: 'dark', label: t('dark') }, { value: 'system', label: t('system') }]} /></div>
        </Row>
        <Row icon={<Globe size={18} />} label={t('language')}>
          <select className="input w-40 py-2" value={s.lang} onChange={(e) => updateSettings({ lang: e.target.value as typeof s.lang })} aria-label={t('language')}>
            {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </Row>
      </Group>

      <Group title={t('learningGoals')}>
        <Row icon={<Target size={18} />} label={t('cardsPerDay')}><Stepper value={s.dailyGoal} min={5} max={500} step={5} onChange={(v) => updateSettings({ dailyGoal: v })} /></Row>
        <Row icon={<Target size={18} />} label={t('newPerDay')}><Stepper value={s.newPerDay} min={0} max={200} step={5} onChange={(v) => updateSettings({ newPerDay: v })} /></Row>
        <Row icon={<Shuffle size={18} />} label={t('shuffle')}><Toggle label={t('shuffle')} checked={s.shuffle} onChange={(v) => updateSettings({ shuffle: v })} /></Row>
        <Row icon={<Volume2 size={18} />} label={t('listen')}><Toggle label={t('listen')} checked={s.tts} onChange={(v) => updateSettings({ tts: v })} /></Row>
      </Group>

      <Group title={t('reminders')}>
        <Row icon={<Bell size={18} />} label={t('enableReminder')}><Toggle label={t('enableReminder')} checked={s.reminderEnabled} onChange={toggleReminder} /></Row>
        <Row icon={<Bell size={18} />} label={t('reminderTime')}><input type="time" className="input w-32 py-2" value={s.reminderTime} onChange={(e) => e.target.value && updateSettings({ reminderTime: e.target.value })} /></Row>
        <div className="py-3">
          <p className="mb-3 text-xs leading-relaxed opacity-55">{t('reminderNote')}</p>
          <Button size="sm" variant="soft" icon={<CalendarPlus size={16} />} onClick={ics}>{t('addToCalendar')}</Button>
        </div>
      </Group>

      <Group title={t('data')}>
        <ActionRow icon={<Download size={18} />} label={t('exportAll')} onClick={() => download(`yodla-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup())} />
        <ActionRow icon={<Upload size={18} />} label={t('importBackup')} onClick={() => fileRef.current?.click()} />
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
          try { const r = importBackup(await readFileText(f)); toast(t('backupRestored', { d: r.decks, c: r.cards })); } catch { toast(t('pdfError'), 'err'); }
        }} />
        <ActionRow icon={<Trash2 size={18} />} label={t('wipe')} danger onClick={async () => { if (await confirmDialog(t('confirmWipe'), { danger: true, ok: t('delete'), cancel: t('cancel') })) { wipeData(); toast(t('deleted')); } }} />
      </Group>

      <Group title={t('account')}>
        {!user.guest && <ActionRow icon={<KeyRound size={18} />} label={t('changePassword')} onClick={() => setPwOpen(true)} />}
        <div className="py-3">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold"><Keyboard size={18} className="opacity-60" />{t('shortcuts')}</p>
          <p className="text-xs leading-relaxed opacity-55">{t('shortcutsList')}</p>
        </div>
        <div className="flex items-center gap-2 py-3 text-sm"><Info size={18} className="opacity-60" /><span className="font-semibold">{t('about')}</span><span className="ml-auto opacity-50">Yodla · {t('version')} 1.0.0</span></div>
        <ActionRow icon={<LogOut size={18} />} label={t('signOut')} danger onClick={async () => { if (await confirmDialog(`${t('signOut')}?`, { ok: t('signOut'), cancel: t('cancel') })) signOut(); }} />
      </Group>

      <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} needOld={user.mode === 'local'} />
      <NameSheet open={nameOpen} onClose={() => setNameOpen(false)} initial={user.name} />
      <UpgradeSheet open={upOpen} onClose={() => setUpOpen(false)} onCode={setCode} />
      {code && <RecoveryCodeScreen code={code} onDone={() => setCode(null)} />}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-wider opacity-45">{title}</h2><div className="card-surface divide-y divide-ink-900/5 rounded-[26px] px-4 dark:divide-white/5">{children}</div></section>;
}
function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return <div className="flex min-h-[56px] items-center gap-3 py-2"><span className="opacity-60">{icon}</span><span className="flex-1 text-sm font-semibold">{label}</span>{children}</div>;
}
function ActionRow({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return <button onClick={onClick} className={`flex min-h-[56px] w-full items-center gap-3 text-left text-sm font-semibold ${danger ? 'text-rose-500' : ''}`}><span className={danger ? '' : 'opacity-60'}>{icon}</span><span className="flex-1">{label}</span><ChevronRight size={18} className="opacity-30" /></button>;
}
function Stepper({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <div className="flex items-center gap-1">
      <button aria-label="−" onClick={() => onChange(Math.max(min, value - step))} className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900/5 text-lg font-bold dark:bg-white/10">−</button>
      <span className="w-10 text-center font-extrabold tabular-nums">{value}</span>
      <button aria-label="+" onClick={() => onChange(Math.min(max, value + step))} className="grid h-9 w-9 place-items-center rounded-xl bg-ink-900/5 text-lg font-bold dark:bg-white/10">+</button>
    </div>
  );
}

function useErrText() {
  const { t } = useT();
  return (e: unknown) => { const m = (e as Error).message; const r = t(m as Key); return r || m; };
}

function PasswordSheet({ open, onClose, needOld }: { open: boolean; onClose: () => void; needOld: boolean }) {
  const { t } = useT();
  const errText = useErrText();
  const [oldPw, setOld] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={t('changePassword')}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (!validatePassword(pw)) return setErr(t('weakPassword'));
        setBusy(true);
        try { await changePassword(pw, oldPw); toast(t('passwordChanged')); setOld(''); setPw(''); setErr(''); onClose(); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
      }}>
        {needOld && <Field label={t('currentPassword')}><input type="password" className="input" value={oldPw} onChange={(e) => setOld(e.target.value)} autoComplete="current-password" /></Field>}
        <Field label={t('newPassword')} error={err} hint={t('weakPassword')}><input type="password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Button type="submit" block size="lg" loading={busy}>{t('save')}</Button>
      </form>
    </Sheet>
  );
}

function NameSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: string }) {
  const { t } = useT();
  const [name, setName] = useState(initial); const [err, setErr] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={t('name')}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return setErr(t('nameRequired'));
        try { await updateName(name); toast(t('saved')); onClose(); } catch (x) { setErr((x as Error).message); }
      }}>
        <Field label={t('name')} error={err}><input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Button type="submit" block size="lg">{t('save')}</Button>
      </form>
    </Sheet>
  );
}

function UpgradeSheet({ open, onClose, onCode }: { open: boolean; onClose: () => void; onCode: (c: string) => void }) {
  const { t } = useT();
  const errText = useErrText();
  const [f, setF] = useState({ name: '', email: '', pw: '' }); const [err, setErr] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={t('createAccount')}>
      <form className="space-y-4" onSubmit={async (e) => {
        e.preventDefault();
        if (!f.name.trim()) return setErr(t('nameRequired'));
        if (!isEmail(f.email)) return setErr(t('invalidEmail'));
        if (!validatePassword(f.pw)) return setErr(t('weakPassword'));
        try { const c = await upgradeGuest(f.email, f.pw, f.name); onClose(); onCode(c); } catch (x) { setErr(errText(x)); }
      }}>
        <Field label={t('name')}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="name" /></Field>
        <Field label={t('email')}><input type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" /></Field>
        <Field label={t('password')} error={err} hint={t('weakPassword')}><input type="password" className="input" value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} autoComplete="new-password" /></Field>
        <p className="text-xs opacity-55">{t('localAuthNote')}</p>
        <Button type="submit" block size="lg">{t('createAccount')}</Button>
      </form>
    </Sheet>
  );
}
