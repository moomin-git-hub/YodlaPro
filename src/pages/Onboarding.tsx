import { useState } from 'react';
import { Brain, CalendarClock, Sparkles, Check } from 'lucide-react';
import { useT, LANGS } from '../lib/i18n';
import { updateSettings, useData } from '../lib/store';
import { Button } from '../components/ui';
import { LogoMark } from '../components/Logo';
import { cx } from '../lib/util';

export function LangPicker() {
  const lang = useData().settings.lang;
  return (
    <div className="flex justify-center gap-1 rounded-2xl bg-ink-900/[.05] p-1 dark:bg-white/[.06]">
      {LANGS.map((l) => (
        <button key={l.code} onClick={() => updateSettings({ lang: l.code })} aria-pressed={lang === l.code}
          className={cx('rounded-xl px-3 py-1.5 text-xs font-bold transition', lang === l.code ? 'bg-white shadow-sm dark:bg-ink-700' : 'opacity-60')}>{l.label}</button>
      ))}
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [i, setI] = useState(0);
  const slides = [
    { icon: Brain, title: t('onb1t'), sub: t('onb1s'), grad: 'from-violet-500 to-fuchsia-500' },
    { icon: CalendarClock, title: t('onb2t'), sub: t('onb2s'), grad: 'from-sky-500 to-indigo-500' },
    { icon: Sparkles, title: t('onb3t'), sub: t('onb3s'), grad: 'from-amber-400 to-pink-500' },
  ];
  const s = slides[i];
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-6">
      <div className="flex items-center justify-between">
        <LogoMark size={32} />
        <LangPicker />
      </div>
      <div key={i} className="flex flex-1 animate-fade flex-col items-center justify-center text-center">
        <div className="relative mb-10">
          <div className={cx('absolute inset-0 rotate-[-8deg] rounded-[36px] bg-gradient-to-br opacity-30 blur-xl', s.grad)} />
          <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-[6deg] rounded-[36px] bg-white/60 dark:bg-white/10" />
          <div className={cx('relative grid h-44 w-44 place-items-center rounded-[36px] bg-gradient-to-br text-white shadow-2xl', s.grad)}><s.icon size={76} strokeWidth={1.6} /></div>
        </div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{s.title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed opacity-60">{s.sub}</p>
      </div>
      <div className="mb-6 flex justify-center gap-2">
        {slides.map((_, k) => <span key={k} className={cx('h-2 rounded-full transition-all', k === i ? 'w-7 bg-brand-500' : 'w-2 bg-ink-900/15 dark:bg-white/20')} />)}
      </div>
      <Button size="lg" block onClick={() => (i < slides.length - 1 ? setI(i + 1) : onDone())}>{i < slides.length - 1 ? t('next') : t('getStarted')}</Button>
      {i < slides.length - 1 && <Button variant="ghost" block className="mt-2" onClick={onDone}>{t('skip')}</Button>}
    </div>
  );
}

export function GoalSetup() {
  const { t } = useT();
  const [goal, setGoal] = useState(20);
  const opts = [{ n: 10, l: t('casual'), e: '🌱' }, { n: 20, l: t('regular'), e: '📘' }, { n: 40, l: t('serious'), e: '🔥' }, { n: 80, l: t('intense'), e: '🚀' }];
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col px-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-12">
      <h1 className="text-[28px] font-extrabold tracking-tight">{t('pickGoal')}</h1>
      <p className="mt-2 opacity-60">{t('appTagline')}</p>
      <div className="mt-8 space-y-3">
        {opts.map((o) => (
          <button key={o.n} onClick={() => setGoal(o.n)} aria-pressed={goal === o.n}
            className={cx('flex w-full items-center gap-4 rounded-3xl border-2 p-4 text-left transition active:scale-[.98]', goal === o.n ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'card-surface border-transparent')}>
            <span className="text-3xl">{o.e}</span>
            <span className="flex-1"><span className="block font-bold">{o.l}</span><span className="text-sm opacity-60">{o.n} {t('cards')} / {t('day')}</span></span>
            {goal === o.n && <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-500 text-white"><Check size={16} /></span>}
          </button>
        ))}
      </div>
      <div className="mt-auto pt-8">
        <Button size="lg" block onClick={() => updateSettings({ dailyGoal: goal, newPerDay: Math.max(5, Math.round(goal / 2)), onboarded: true })}>{t('getStarted')}</Button>
      </div>
    </div>
  );
}
