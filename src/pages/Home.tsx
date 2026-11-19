import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flame, Clock, CheckCircle2, CalendarClock, Play, ChevronRight, Sparkles, Layers, PartyPopper } from 'lucide-react';
import { useData } from '../lib/store';
import { buildQueue } from '../lib/queue';
import { useT } from '../lib/i18n';
import { getUser } from '../lib/auth';
import { dayCounts, streaks, todayStats, totalStudyMs, deckStats, forecast, lastNDays, fmtTime } from '../lib/stats';
import { dayKey } from '../lib/srs';
import { PUBLIC_DECKS } from '../lib/catalog';
import { Ring, Bars, Button, DeckCover, Empty } from '../components/ui';

export function Home() {
  const d = useData();
  const { t, locale } = useT();
  const nav = useNavigate();
  const user = getUser();
  const s = useMemo(() => {
    const today = todayStats(d);
    // same queue the Study screen builds (active decks only, frozen/archived/fast-review excluded, daily new limit)
    const q = buildQueue(d, 'all', false);
    const byId = new Map(d.cards.map((c) => [c.id, c]));
    const srs = q.main.filter((x) => x.mode === 'srs');
    const newAvail = srs.filter((x) => byId.get(x.id)?.status === 'new').length;
    const due = srs.length - newAvail + q.learn.length;
    const learned = d.cards.filter((c) => c.status !== 'new').length;
    const counts = dayCounts(d);
    const week = lastNDays(7);
    const weekly = week.map((ts) => counts.get(dayKey(ts))?.reviews ?? 0);
    const st = streaks(d);
    const decks = d.decks.map((deck) => ({ deck, ...deckStats(d.cards.filter((c) => c.deckId === deck.id)) }));
    const lastDeckId = d.reviews.length ? d.reviews[d.reviews.length - 1].deckId : null;
    const best = decks.filter((x) => x.due > 0).sort((a, b) => b.due - a.due)[0] ?? decks.find((x) => x.deck.id === lastDeckId && x.new > 0) ?? decks.find((x) => x.new > 0);
    const owned = new Set(d.decks.map((x) => x.sourcePublicId));
    const cats = new Set(d.decks.map((x) => x.category));
    const recs = PUBLIC_DECKS.filter((p) => !owned.has(p.id)).sort((a, b) => Number(cats.has(b.category)) - Number(cats.has(a.category))).slice(0, 6);
    return { today, due, newAvail, learned, weekly, week, st, decks, best, recs, fc: forecast(d.cards.filter((c) => !c.frozen && d.decks.some((x) => x.id === c.deckId && !x.archived)), 7), time: totalStudyMs(d) };
  }, [d]);

  const h = new Date().getHours();
  const greet = h < 12 ? t('greetingMorning') : h < 18 ? t('greetingAfternoon') : t('greetingEvening');
  const goal = d.settings.dailyGoal;
  const pct = s.today.reviews / goal;
  const toStudy = s.due + s.newAvail;
  const dayLabel = (ts: number) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(ts).slice(0, 3);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pt-1">
        <div>
          <p className="text-sm font-semibold opacity-55">{greet}</p>
          <h1 className="text-[26px] font-extrabold tracking-tight">{user?.name || 'Learner'} 👋</h1>
        </div>
        <Link to="/activity" className="card-surface flex items-center gap-1.5 rounded-2xl px-3.5 py-2 font-extrabold text-orange-500" aria-label={`${t('streak')}: ${s.st.current}`}>
          <Flame size={20} className={s.st.current ? 'fill-orange-400' : 'opacity-40'} />{s.st.current}
        </Link>
      </header>

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-500 via-violet-500 to-fuchsia-500 p-5 text-white shadow-xl shadow-brand-500/25">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 right-16 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-5">
          <Ring value={pct} size={108} stroke={11} color="#fff">
            <div><div className="text-2xl font-extrabold leading-none">{s.today.reviews}</div><div className="text-xs font-semibold opacity-75">/ {goal}</div></div>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold opacity-80">{t('dailyGoal')}</p>
            <p className="text-lg font-extrabold leading-snug">{pct >= 1 ? t('goalReached') : t('cardsToday', { n: s.today.reviews, goal })}</p>
            <p className="mt-1 text-sm opacity-80">{s.due} {t('due').toLowerCase()} · {s.newAvail} {t('newCards').toLowerCase()}</p>
          </div>
        </div>
        <div className="relative mt-5">
          {toStudy > 0 ? (
            <button onClick={() => nav(s.best && s.best.due === s.due ? `/study/${s.best.deck.id}` : '/study/all')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 font-extrabold text-brand-600 shadow-lg transition active:scale-[.98]">
              <Play size={18} className="fill-brand-600" />{s.today.reviews ? t('continueStudying') : t('startStudying')} · {toStudy}
            </button>
          ) : d.cards.length ? (
            <div className="flex items-center gap-3 rounded-2xl bg-white/15 p-3.5 text-sm"><PartyPopper size={22} /><div><b>{t('allCaughtUp')}</b><br /><span className="opacity-80">{t('allCaughtUpSub')}</span></div></div>
          ) : (
            <button onClick={() => nav('/create')} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 font-extrabold text-brand-600">{t('createDeck')}</button>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={<CalendarClock size={18} />} tone="text-sky-500 bg-sky-500/10" label={t('dueToday')} value={s.due} />
        <Stat icon={<CheckCircle2 size={18} />} tone="text-emerald-500 bg-emerald-500/10" label={t('learned')} value={s.learned} />
        <Stat icon={<Flame size={18} />} tone="text-orange-500 bg-orange-500/10" label={t('streak')} value={`${s.st.current} ${s.st.current === 1 ? t('day') : t('days')}`} />
        <Stat icon={<Clock size={18} />} tone="text-violet-500 bg-violet-500/10" label={t('studyTime')} value={fmtTime(s.time, t)} />
      </section>

      <section className="card-surface rounded-[28px] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-extrabold">{t('weeklyActivity')}</h2>
          <Link to="/stats" className="flex items-center text-sm font-bold text-brand-600 dark:text-brand-300">{t('stats')}<ChevronRight size={16} /></Link>
        </div>
        <Bars values={s.weekly} labels={s.week.map(dayLabel)} height={110} />
      </section>

      {s.decks.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-extrabold">{t('decks')}</h2>
            <Link to="/decks" className="flex items-center text-sm font-bold text-brand-600 dark:text-brand-300">{t('all')}<ChevronRight size={16} /></Link>
          </div>
          <div className="space-y-2.5">
            {[...s.decks].sort((a, b) => b.due - a.due || b.deck.updatedAt - a.deck.updatedAt).slice(0, 3).map((x) => (
              <Link key={x.deck.id} to={`/deck/${x.deck.id}`} className="card-surface flex items-center gap-3 rounded-3xl p-3 transition active:scale-[.99]">
                <DeckCover cover={x.deck.cover} color={x.deck.color} image={x.deck.image} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{x.deck.title}</p>
                  <p className="text-xs opacity-55">{x.total} {t('cards')} · {x.progress}%</p>
                </div>
                {x.due > 0 && <span className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-extrabold text-white">{x.due}</span>}
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <div className="card-surface rounded-[28px]">
          <Empty icon={<Layers size={28} />} title={t('noDecksYet')} sub={t('noDecksSub')} action={<div className="flex gap-2"><Button onClick={() => nav('/deck/new')}>{t('createDeck')}</Button><Button variant="secondary" onClick={() => nav('/explore')}>{t('browseExplore')}</Button></div>} />
        </div>
      )}

      {s.fc.some((n) => n > 0) && (
        <section className="card-surface rounded-[28px] p-5">
          <h2 className="mb-3 font-extrabold">{t('upcoming')}</h2>
          <ul className="divide-y divide-ink-900/5 dark:divide-white/5">
            {s.fc.map((n, i) => n > 0 && (
              <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-semibold">{i === 0 ? t('today') : i === 1 ? t('tomorrow') : t('inDays', { n: i })}</span>
                <span className="rounded-full bg-ink-900/5 px-2.5 py-0.5 font-bold dark:bg-white/10">{n} {t('cards')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.recs.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-extrabold"><Sparkles size={18} className="text-amber-500" />{t('recommended')}</h2>
            <Link to="/explore" className="flex items-center text-sm font-bold text-brand-600 dark:text-brand-300">{t('explore')}<ChevronRight size={16} /></Link>
          </div>
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
            {s.recs.map((p) => (
              <Link key={p.id} to={`/explore/${p.id}`} className="card-surface w-44 shrink-0 snap-start rounded-3xl p-4 transition active:scale-[.98]">
                <DeckCover cover={p.cover} color={p.color} />
                <p className="mt-3 line-clamp-2 text-sm font-bold leading-snug">{p.title}</p>
                <p className="mt-1 text-xs opacity-55">{p.cards.length} {t('cards')}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: string }) {
  return (
    <div className="card-surface rounded-3xl p-4">
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${tone}`}>{icon}</div>
      <div className="truncate text-xl font-extrabold">{value}</div>
      <div className="truncate text-xs font-semibold opacity-55">{label}</div>
    </div>
  );
}
