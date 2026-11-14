import { useState, type FormEvent } from 'react';
import { Mail, Lock, User as UserIcon, Eye, EyeOff, ShieldCheck, Copy } from 'lucide-react';
import { useT, type Key } from '../lib/i18n';
import { signIn, signUp, requestReset, resetWithCode, continueAsGuest, activateLocal, changePassword, clearRecovery, AuthError, validatePassword } from '../lib/auth';
import { cloudEnabled } from '../lib/api';
import { Button, Field, toast } from '../components/ui';
import { Logo } from '../components/Logo';
import { LangPicker } from './Onboarding';
import { isEmail, cx } from '../lib/util';

type Mode = 'in' | 'up' | 'reset';

function useErr() {
  const { t } = useT();
  return (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    try { return t(m as Key) === m ? m : t(m as Key); } catch { return m; }
  };
}

function PwInput({ value, onChange, err, auto, placeholder }: { value: string; onChange: (v: string) => void; err?: boolean; auto: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
      <input className={cx('input pl-11 pr-12', err && 'err')} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={auto} placeholder={placeholder ?? '••••••••'} />
      <button type="button" onClick={() => setShow(!show)} aria-label="Show password" className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-50">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
  );
}

export function AuthPage() {
  const { t } = useT();
  const toMsg = useErr();
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [recovery, setRecovery] = useState<{ code: string; id: string } | null>(null);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!isEmail(email)) e.email = t('invalidEmail');
    if (mode === 'up' && !name.trim()) e.name = t('nameRequired');
    if (mode === 'in' && !pw) e.pw = t('passwordRequired');
    if (mode === 'up' && !validatePassword(pw)) e.pw = t('weakPassword');
    if (mode === 'reset' && !cloudEnabled) {
      if (!code.trim()) e.code = t('required');
      if (!validatePassword(pw)) e.pw = t('weakPassword');
    }
    setErrs(e);
    return !Object.keys(e).length;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setInfo('');
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email, pw);
      else if (mode === 'up') {
        const r = await signUp(email, pw, name);
        if (r.confirm) { setInfo(t('confirmEmail')); setMode('in'); }
        else if (r.recoveryCode && r.user) setRecovery({ code: r.recoveryCode, id: r.user.id });
      } else if (cloudEnabled) { await requestReset(email); setInfo(t('resetSent')); }
      else { await resetWithCode(email, code, pw); setInfo(t('resetDone')); setMode('in'); setPw(''); }
    } catch (e) {
      setErrs({ form: toMsg(e instanceof AuthError ? e : new Error(String((e as Error).message))) });
    } finally { setBusy(false); }
  };

  if (recovery) return <RecoveryCodeScreen code={recovery.code} onDone={() => activateLocal(recovery.id)} />;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-6 pb-10 pt-6 safe-bottom">
      <div className="flex items-center justify-between"><Logo /><LangPicker /></div>
      <div className="mt-10 animate-fade">
        <h1 className="text-[28px] font-extrabold tracking-tight">{mode === 'in' ? t('welcomeBack') : mode === 'up' ? t('createYourAccount') : t('resetPassword')}</h1>
        <p className="mt-1 opacity-60">{t('appTagline')}</p>
      </div>
      <form onSubmit={submit} noValidate className="mt-8 space-y-4">
        {mode === 'up' && (
          <Field label={t('name')} error={errs.name}>
            <div className="relative"><UserIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" /><input className={cx('input pl-11', errs.name && 'err')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} /></div>
          </Field>
        )}
        <Field label={t('email')} error={errs.email}>
          <div className="relative"><Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" /><input className={cx('input pl-11', errs.email && 'err')} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></div>
        </Field>
        {mode === 'reset' && !cloudEnabled && (
          <Field label={t('recoveryCode')} error={errs.code}><input className={cx('input font-mono uppercase tracking-widest', errs.code && 'err')} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC-DEF" /></Field>
        )}
        {(mode !== 'reset' || !cloudEnabled) && (
          <Field label={mode === 'reset' ? t('newPassword') : t('password')} error={errs.pw} hint={mode !== 'in' ? t('weakPassword') : undefined}>
            <PwInput value={pw} onChange={setPw} err={!!errs.pw} auto={mode === 'in' ? 'current-password' : 'new-password'} />
          </Field>
        )}
        {mode === 'in' && <button type="button" onClick={() => { setMode('reset'); setErrs({}); }} className="text-sm font-semibold text-brand-600 dark:text-brand-300">{t('forgotPassword')}</button>}
        {errs.form && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{errs.form}</p>}
        {info && <p role="status" className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">{info}</p>}
        <Button size="lg" block loading={busy} type="submit">{mode === 'in' ? t('signIn') : mode === 'up' ? t('signUp') : cloudEnabled ? t('sendLink') : t('resetPassword')}</Button>
      </form>
      <div className="mt-6 text-center text-sm">
        {mode === 'in' ? (<>{t('noAccount')} <button className="font-bold text-brand-600 dark:text-brand-300" onClick={() => { setMode('up'); setErrs({}); setInfo(''); }}>{t('signUp')}</button></>)
          : mode === 'up' ? (<>{t('haveAccount')} <button className="font-bold text-brand-600 dark:text-brand-300" onClick={() => { setMode('in'); setErrs({}); }}>{t('signIn')}</button></>)
          : <button className="font-bold text-brand-600 dark:text-brand-300" onClick={() => { setMode('in'); setErrs({}); }}>{t('backToSignIn')}</button>}
      </div>
      {!cloudEnabled && (
        <div className="mt-auto pt-10">
          <Button variant="secondary" block onClick={continueAsGuest}>{t('continueGuest')}</Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs opacity-50"><ShieldCheck size={14} />{t('localAuthNote')}</p>
        </div>
      )}
    </div>
  );
}

export function RecoveryCodeScreen({ code, onDone }: { code: string; onDone?: () => void }) {
  const { t } = useT();
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-50 p-6 dark:bg-ink-950">
      <div className="w-full max-w-sm animate-pop text-center">
        <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15"><ShieldCheck size={32} /></div>
        <h1 className="text-2xl font-extrabold">{t('recoveryCode')}</h1>
        <p className="mt-2 text-sm opacity-60">{t('recoveryCodeNote')}</p>
        <button onClick={() => { navigator.clipboard?.writeText(code).then(() => toast(t('copied'))); }} className="card-surface mx-auto my-6 flex items-center gap-3 rounded-3xl px-6 py-4 font-mono text-3xl font-bold tracking-[.2em]">{code}<Copy size={18} className="opacity-40" /></button>
        <Button size="lg" block onClick={() => { setDone(true); onDone?.(); }}>{t('iSavedIt')}</Button>
      </div>
    </div>
  );
}

export function SetNewPassword({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const toMsg = useErr();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validatePassword(pw)) return setErr(t('weakPassword'));
    setBusy(true);
    try { await changePassword(pw); clearRecovery(); toast(t('resetDone')); onDone(); }
    catch (x) { setErr(toMsg(x)); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-5 px-6 pt-16">
      <Logo />
      <h1 className="text-2xl font-extrabold">{t('setNewPassword')}</h1>
      <Field label={t('newPassword')} error={err} hint={t('weakPassword')}><PwInput value={pw} onChange={setPw} err={!!err} auto="new-password" /></Field>
      <Button size="lg" block loading={busy} type="submit">{t('save')}</Button>
    </form>
  );
}
