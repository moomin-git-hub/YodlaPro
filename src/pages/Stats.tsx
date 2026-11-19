import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Trophy, Target, Clock, BookOpen, GraduationCap, Repeat, BarChart3 } from 'lucide-react';
import { useData } from '../lib/store';
import { useT } from '../lib/i18n';
import { dayCounts, streaks, totalStudyMs, deckStats, forecast, lastNDays, fmtTime } from '../lib/stats';
import { dayKey, isMastered, DAY, startOfDay } from '../lib/srs';
import { Bars, DeckCover, Empty, PageHeader, Ring, Segmented } from '../components/ui';
import { cx } from '../lib/util';
import { FileText, Sheet as SheetIcon, FileType2 } from 'lucide-react';
import { cloudEnabled, getToken } from '../lib/api';
import { downloadReport } from '../components/TelegramCard';
import { toast } from '../components/ui';

/** PDF overview, Excel with every card, Word hard-words notebook (built on the server). */
function Reports() {
  const { t } = useT();
  const [busy, setBusy] = useState<string | null>(null);
  if (!cloudEnabled || !getToken()) return null;
  const items = [['pdf', 'PDF', <FileText key="p" size={18} />, 'text-rose-500 bg-rose-500/10'], ['xlsx', 'Excel', <SheetIcon key="x" size={18} />, 'text-emerald-600 bg-emerald-500/10'], ['docx', 'Word', <FileType2 key="w" size={18} />, 'text-sky-600 bg-sky-500/10']] as const;
  return (
    <section className="card-surface rounded-3xl p-4">
      <p className="mb-3 font-bold">{t('reports')}</p>
      <div className="grid grid-cols-3 gap-2">
        {items.map(([fmt, label, icon, tone]) => (
          <button key={fmt} disabled={!!busy} onClick={async () => { setBusy(fmt); try { await downloadReport(fmt); } catch (e) { toast((e as Error).message, 'err'); } finally { setBusy(null); } }}
            className="flex flex-col items-center gap-1.5 rounded-2xl bg-ink-900/[.04] p-3 text-sm font-bold transition hover:bg-ink-900/[.08] disabled:opacity-50 dark:bg-white/5">
            <span className={cx('grid h-9 w-9 place-items-center rounded-xl', tone)}>{busy === fmt ? '…' : icon}</span>{label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function Stats() {
  const d = useData();
  const { t, locale } = useT();
  const [range, setRange] = useState<'7' | '30'>('7');
  const s = useMemo(() => {
    const counts = dayCounts(d);
    const studied = d.cards.filter((c) => c.status !== 'new').length;
    const mastered = d.cards.filter(isMastered).length;
    const correct = d.reviews.filter((r) => r.rating >= 3).length;
    const st = streaks(d);
    const days = lastNDays(Number(range));
    const vals = days.map((ts) => counts.get(dayKey(ts))?.reviews ?? 0);
    const rangeStart = days[0];
    const rRev = d.reviews.filter((r) => r.ts >= rangeStart);
    const rAcc = rRev.length ? Math.round((rRev.filter((r) => r.rating >= 3).length / rRev.length) * 100) : 0;
    // heatmap: 12 weeks ending this week
    const today = startOfDay(Date.now());
    const dow = (new Date(today).getDay() + 6) % 7;
    const start = today - (7 * 11 + dow) * DAY;
    const heat: { ts: number; n: number }[] = [];
    for (let ts = start; ts <= today; ts += DAY) heat.push({ ts, n: counts.get(dayKey(ts))?.reviews ?? 0 });
    const maxHeat = Math.max(1, ...heat.map((h) => h.n));
    const decks = d.decks.map((deck) => ({ deck, ...deckStats(d.cards.filter((c) => c.deckId === deck.id)), reviews: d.reviews.filter((r) => r.deckId === deck.id).length })).sort((a, b) => b.reviews - a.reviews);
    return { studied, mastered, learning: studied - mastered, total: d.reviews.length, acc: d.reviews.length ? Math.round((correct / d.reviews.length) * 100) : 0, st, days, vals, rAcc, rTotal: rRev.length, heat, maxHeat, decks, fc: forecast(d.cards, 7), time: totalStudyMs(d) };
  }, [d, range]);

  const dayFmt = (ts: number) => range === '7' ? new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(ts).slice(0, 3) : String(new Date(ts).getDate());
  if (!d.reviews.length) return (<div><PageHeader title={t('stats')} /><Empty icon={<BarChart3 size={28} />} title={t('stats')} sub={t('noStatsYet')} action={<Link to="/decks" className="font-bold text-brand-600 dark:text-brand-300">{t('decks')} →</Link>} /></div>);

  return (
    <div className="space-y-5">
      <PageHeader title={t('stats')} />
      <Reports />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile icon={<BookOpen size={18} />} tone="text-sky-500 bg-sky-500/10" label={t('totalStudied')} value={s.studied} />
        <Tile icon={<GraduationCap size={18} />} tone="text-emerald-500 bg-emerald-500/10" label={t('mastered')} value={s.mastered} />
        <Tile icon={<Repeat size={18} />} tone="text-amber-500 bg-amber-500/10" label={t('stillLearning')} value={s.learning} />
        <Tile icon={<Target size={18} />} tone="text-violet-500 bg-violet-500/10" label={t('totalReviews')} value={s.total} />
      </section>
      <section className="grid grid-cols-3 gap-3">
        <div className="card-surface flex flex-col items-center rounded-3xl p-4"><Ring value={s.acc / 100} size={76} stroke={8}><span className="text-lg font-extrabold">{s.acc}%</span></Ring><span className="mt-2 text-xs font-semibold opacity-55">{t('accuracy')}</span></div>
        <Link to="/activity" className="card-surface flex flex-col items-center justify-center rounded-3xl p-4 text-center"><Flame className="text-orange-500" size={28} /><span className="mt-1 text-2xl font-extrabold">{s.st.current}</span><span className="text-xs font-semibold opacity-55">{t('streak')} · <Trophy size={11} className="inline" /> {s.st.best}</span></Link>
        <div className="card-surface flex flex-col items-center justify-center rounded-3xl p-4 text-center"><Clock className="text-violet-500" size={28} /><span className="mt-1 text-lg font-extrabold leading-tight">{fmtTime(s.time, t)}</span><span className="text-xs font-semibold opacity-55">{t('totalTime')}</span></div>
      </section>

      <section className="card-surface rounded-[28px] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-extrabold">{t('dailyActivity')}</h2>
          <div className="w-40"><Segmented value={range} onChange={setRange} options={[{ value: '7', label: t('last7') }, { value: '30', label: t('last30') }]} /></div>
        </div>
        <Bars values={s.vals} labels={s.days.map((ts, i) => (range === '30' && i % 5 !== 4 ? '' : dayFmt(ts)))} height={140} format={(v) => t('reviewsCount', { n: v })} />
        <p className="mt-3 text-sm opacity-60">{t('reviewsCount', { n: s.rTotal })} · {t('accuracy')} {s.rAcc}%</p>
      </section>

      <section className="card-surface rounded-[28px] p-5">
        <h2 className="mb-4 font-extrabold">{t('last12w')}</h2>
        <div className="grid grid-flow-col grid-rows-7 gap-1" role="img" aria-label={t('last12w')}>
          {s.heat.map((h) => {
            const lvl = h.n === 0 ? 0 : Math.ceil((h.n / s.maxHeat) * 4);
            return <div key={h.ts} title={`${new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(h.ts)}: ${h.n}`} className={cx('aspect-square rounded-[4px]', ['bg-ink-900/[.06] dark:bg-white/[.06]', 'bg-brand-200 dark:bg-brand-500/30', 'bg-brand-300 dark:bg-brand-500/55', 'bg-brand-400 dark:bg-brand-400/80', 'bg-brand-600 dark:bg-brand-300'][lvl])} />;
          })}
        </div>
      </section>

      <section className="card-surface rounded-[28px] p-5">
        <h2 className="mb-4 font-extrabold">{t('forecast')}</h2>
        <Bars values={s.fc} labels={s.fc.map((_, i) => (i === 0 ? t('today').slice(0, 5) : new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(Date.now() + i * DAY).slice(0, 3)))} height={100} highlightLast={false} />
      </section>

      <section>
        <h2 className="mb-3 font-extrabold">{t('progressByDeck')}</h2>
        <div className="space-y-2.5">
          {s.decks.map((x) => (
            <Link key={x.deck.id} to={`/deck/${x.deck.id}`} className="card-surface block rounded-3xl p-4">
              <div className="mb-3 flex items-center gap-3">
                <DeckCover cover={x.deck.cover} color={x.deck.color} image={x.deck.image} size="sm" />
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{x.deck.title}</p><p className="text-xs opacity-55">{t('reviewsCount', { n: x.reviews })} · {x.total} {t('cards')}</p></div>
                <span className="font-extrabold">{x.progress}%</span>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-900/[.06] dark:bg-white/10">
                <div className="bg-emerald-500" style={{ width: `${(x.mastered / Math.max(1, x.total)) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${(x.learning / Math.max(1, x.total)) * 100}%` }} />
              </div>
              <div className="mt-2 flex gap-4 text-[11px] font-semibold opacity-60">
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />{t('mastered')} {x.mastered}</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-400" />{t('learning')} {x.learning}</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-ink-900/20 dark:bg-white/20" />{t('newCards')} {x.new}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Tile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: string }) {
  return <div className="card-surface rounded-3xl p-4"><div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${tone}`}>{icon}</div><div className="text-2xl font-extrabold">{value}</div><div className="truncate text-xs font-semibold opacity-55">{label}</div></div>;
}
