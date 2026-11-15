import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Flame, Trophy, CheckCircle2 } from 'lucide-react';
import { useData } from '../lib/store';
import { useT } from '../lib/i18n';
import { streaks } from '../lib/stats';
import { startOfDay } from '../lib/srs';
import { cx } from '../lib/util';
import { IconButton } from '../components/ui';

/** Activity: current & longest streak, active days and a month calendar of study days (Noji-style). */
export function Activity() {
  const d = useData();
  const { t, locale } = useT();
  const nav = useNavigate();
  const st = streaks(d);
  const studied = new Set(d.reviews.map((r) => startOfDay(r.ts)));
  const today = startOfDay(Date.now());
  const first = new Date(Math.min(today, ...studied)); const firstMonth = new Date(first.getFullYear(), first.getMonth(), 1).getTime();
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).getTime(); });
  const m = new Date(month);
  const shift = (by: number) => new Date(m.getFullYear(), m.getMonth() + by, 1).getTime();
  const daysIn = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(m.getDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1).getTime())];
  while (cells.length % 7) cells.push(null);
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 10, 15 + i)));
  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center gap-2"><IconButton label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton><h1 className="flex-1 text-center text-xl font-extrabold">{t('activity')}</h1><span className="w-10" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="card-surface flex flex-col items-center rounded-3xl p-4"><div className="flex items-center gap-1"><Flame size={34} className="text-amber-500" /><span className="text-4xl font-extrabold">{st.current}</span></div><span className="text-sm font-semibold opacity-60">{t('dayStreak')}</span></div>
        <div className="card-surface flex flex-col items-center rounded-3xl p-4"><div className="flex items-center gap-1"><Trophy size={34} className="text-brand-500" /><span className="text-4xl font-extrabold">{st.best}</span></div><span className="text-sm font-semibold opacity-60">{t('longestStreak')}</span></div>
      </div>
      <div className="card-surface mt-3 flex items-center justify-center gap-2 rounded-3xl p-4"><CheckCircle2 className="text-sky-500" /><span className="text-2xl font-extrabold">{studied.size}</span><span className="font-semibold opacity-60">{t('activeDays')}</span></div>
      <div className="card-surface mt-3 rounded-3xl p-4">
        <div className="mb-3 flex items-center">
          <IconButton label="Previous" onClick={() => setMonth(shift(-1))} disabled={month <= firstMonth} className="text-sky-500 disabled:opacity-25"><ChevronLeft /></IconButton>
          <span className="flex-1 text-center text-lg font-bold capitalize">{new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(m)}</span>
          <IconButton label="Next" onClick={() => setMonth(shift(1))} disabled={shift(1) > today} className="text-sky-500 disabled:opacity-25"><ChevronRight /></IconButton>
        </div>
        <div className="grid grid-cols-7 text-center text-sm font-semibold">{weekdays.map((w) => <span key={w} className="pb-2">{w}</span>)}</div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day == null) return <span key={i} className="h-12" />;
            const on = studied.has(day), col = i % 7;
            const prevOn = col > 0 && cells[i - 1] != null && studied.has(cells[i - 1]!), nextOn = col < 6 && cells[i + 1] != null && studied.has(cells[i + 1]!);
            return (
              <div key={i} className="relative grid h-12 place-items-center">
                {on && prevOn && <span className="absolute left-0 top-1 h-10 w-1/2 bg-amber-500/20" />}
                {on && nextOn && <span className="absolute right-0 top-1 h-10 w-1/2 bg-amber-500/20" />}
                <span className={cx('relative grid h-10 w-10 place-items-center rounded-full', on && 'border-2 border-amber-500 bg-amber-500/20', on && day === today && 'bg-amber-500/50', day === today ? 'font-extrabold' : 'font-medium', day > today && 'opacity-50')}>{new Date(day).getDate()}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
