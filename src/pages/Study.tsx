import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { X, Bookmark, AlertTriangle, Undo2, Volume2, Pencil, Trophy, Target, Clock, Lightbulb } from 'lucide-react';
import { useData, getData, review, undoReview, updateCard, addSession } from '../lib/store';
import { useT } from '../lib/i18n';
import { isDue, isHard, previewLabel, MIN } from '../lib/srs';
import { todayStats, fmtTime } from '../lib/stats';
import { Button, IconButton, ProgressBar, Ring } from '../components/ui';
import { cx } from '../lib/util';
import type { Card, Rating } from '../lib/types';

type Item = { id: string; practice: boolean };
const shuffleArr = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

function buildQueue(target: string, practice: boolean): Item[] {
  const d = getData();
  const pool = target === 'all' ? d.cards : target === 'difficult' ? d.cards.filter(isHard) : target === 'bookmarks' ? d.cards.filter((c) => c.bookmarked) : d.cards.filter((c) => c.deckId === target);
  const sh = d.settings.shuffle;
  if (practice) return (sh ? shuffleArr(pool) : pool).map((c) => ({ id: c.id, practice: true }));
  const due = pool.filter((c) => isDue(c)).sort((a, b) => a.due - b.due);
  const room = Math.max(0, d.settings.newPerDay - todayStats(d).newIntroduced);
  const fresh = pool.filter((c) => c.status === 'new').sort((a, b) => a.createdAt - b.createdAt).slice(0, room);
  const r = sh ? shuffleArr(due) : due, n = sh ? shuffleArr(fresh) : fresh;
  const out: Item[] = [];
  let i = 0, j = 0;
  while (i < r.length || j < n.length) {
    if (i < r.length) out.push({ id: r[i++].id, practice: false });
    if (i < r.length) out.push({ id: r[i++].id, practice: false });
    if (j < n.length) out.push({ id: n[j++].id, practice: false });
  }
  if (target === 'difficult' || target === 'bookmarks') {
    const inQ = new Set(out.map((x) => x.id));
    out.push(...(sh ? shuffleArr(pool) : pool).filter((c) => !inQ.has(c.id)).map((c) => ({ id: c.id, practice: true })));
  }
  return out;
}

function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = /[Ѐ-ӿ]/.test(text) ? 'ru-RU' : /[؀-ۿ]/.test(text) ? 'ar' : /[぀-ヿ一-鿿]/.test(text) ? 'ja-JP' : 'en-US';
  u.rate = 0.95;
  speechSynthesis.speak(u);
}

export function Study() {
  const { target = 'all' } = useParams();
  const [sp] = useSearchParams();
  const practiceAll = sp.get('practice') === '1';
  const nav = useNavigate();
  const { t } = useT();
  const data = useData();
  const [queue, setQueue] = useState<Item[]>(() => buildQueue(target, practiceAll));
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, correct: 0 });
  const [history, setHistory] = useState<{ prev: Card | null; queue: Item[]; pos: number; stats: typeof stats }[]>([]);
  const started = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const saved = useRef(false);
  const total = useRef(queue.length);

  const item = queue[pos];
  const card = item ? data.cards.find((c) => c.id === item.id) : undefined;
  const done = pos >= queue.length;
  const deck = data.decks.find((x) => x.id === target);
  const title = target === 'all' ? t('study') : target === 'difficult' ? t('difficultCards') : target === 'bookmarks' ? t('bookmarks') : deck?.title ?? '';

  const finish = useCallback(() => {
    if (saved.current) return;
    saved.current = true;
    const end = Date.now();
    addSession({ deckId: deck ? deck.id : null, startedAt: started.current, endedAt: end, durationMs: end - started.current, cardsReviewed: stats.reviewed, correct: stats.correct });
  }, [deck, stats]);

  useEffect(() => { if (done && queue.length) finish(); }, [done, queue.length, finish]);
  useEffect(() => { shownAt.current = Date.now(); setFlipped(false); }, [pos, queue]);
  useEffect(() => { if (card && !card.front) setPos((p) => p + 1); }, [card]);

  const rate = useCallback((r: Rating) => {
    if (!card || !item || !flipped) return;
    const snap = { prev: item.practice ? null : card, queue, pos, stats };
    let nextQueue = queue;
    if (item.practice) {
      if (r === 1) nextQueue = [...queue.slice(0, pos + 1), ...queue.slice(pos + 1, pos + 4), { ...item }, ...queue.slice(pos + 4)];
    } else {
      review(card.id, r, Date.now() - shownAt.current);
      const updated = getData().cards.find((c) => c.id === card.id);
      if (updated && (updated.status === 'learning' || updated.status === 'relearning') && updated.due - Date.now() <= 20 * MIN) {
        const gap = Math.max(2, Math.min(6, Math.round((updated.due - Date.now()) / MIN / 2)));
        const at = Math.min(queue.length, pos + 1 + gap);
        nextQueue = [...queue.slice(0, at), { id: card.id, practice: false }, ...queue.slice(at)];
      }
    }
    setHistory((h) => [...h.slice(-20), snap]);
    setStats((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (r >= 3 ? 1 : 0) }));
    setQueue(nextQueue);
    setPos((p) => p + 1);
    if (nextQueue.length > total.current) total.current = nextQueue.length;
    if (navigator.vibrate) navigator.vibrate(8);
  }, [card, item, flipped, queue, pos, stats]);

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    if (last.prev) undoReview(last.prev);
    setHistory((h) => h.slice(0, -1));
    setQueue(last.queue); setPos(last.pos); setStats(last.stats);
    saved.current = false;
  }, [history]);

  const exit = useCallback(() => { finish(); nav(-1); }, [finish, nav]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') return exit();
      if (done) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      else if (['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating);
      else if (e.key.toLowerCase() === 'z') undo();
      else if (card && e.key.toLowerCase() === 'b') updateCard(card.id, { bookmarked: !card.bookmarked });
      else if (card && e.key.toLowerCase() === 'd') updateCard(card.id, { difficult: !card.difficult });
      else if (card && e.key.toLowerCase() === 's') speak(flipped ? card.back : card.front);
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [rate, undo, exit, done, card, flipped]);

  const labels = useMemo(() => (card && !item?.practice ? ([1, 2, 3, 4] as Rating[]).map((r) => previewLabel(card, r)) : null), [card, item]);

  if (!queue.length) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 grid h-20 w-20 place-items-center rounded-[28px] bg-emerald-100 text-4xl dark:bg-emerald-500/15">🎉</div>
        <h1 className="text-2xl font-extrabold">{t('allCaughtUp')}</h1>
        <p className="mt-2 opacity-60">{t('allCaughtUpSub')}</p>
        <div className="mt-8 flex w-full gap-3">
          <Button variant="secondary" block onClick={() => nav(-1)}>{t('backToDeck')}</Button>
          <Button block onClick={() => { const q = buildQueue(target, true); total.current = q.length; setQueue(q); setPos(0); }} disabled={!buildQueue(target, true).length}>{t('practice')}</Button>
        </div>
      </div>
    );
  }

  if (done) {
    const acc = stats.reviewed ? Math.round((stats.correct / stats.reviewed) * 100) : 0;
    return (
      <div className="mx-auto flex min-h-full max-w-md animate-fade flex-col items-center justify-center px-6 py-10 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-pulse rounded-full bg-brand-500/20 blur-2xl" />
          <Ring value={acc / 100} size={150} stroke={14}><div><Trophy className="mx-auto mb-1 text-amber-500" size={30} /><div className="text-3xl font-extrabold">{acc}%</div></div></Ring>
        </div>
        <h1 className="text-[28px] font-extrabold">{t('sessionComplete')}</h1>
        <p className="mt-1 opacity-60">{title}</p>
        <div className="mt-8 grid w-full grid-cols-3 gap-3">
          <Summary icon={<Target size={18} />} label={t('reviewed')} value={stats.reviewed} />
          <Summary icon={<Trophy size={18} />} label={t('accuracy')} value={`${acc}%`} />
          <Summary icon={<Clock size={18} />} label={t('time')} value={fmtTime(Date.now() - started.current, t)} />
        </div>
        <div className="mt-8 flex w-full gap-3">
          {history.length > 0 && <IconButton label={t('undo')} onClick={undo} className="card-surface h-12 w-12 shrink-0 rounded-2xl"><Undo2 size={20} /></IconButton>}
          <Button variant="secondary" size="lg" block onClick={() => { saved.current = false; started.current = Date.now(); const q = buildQueue(target, false); const qq = q.length ? q : buildQueue(target, true); total.current = qq.length; setQueue(qq); setPos(0); setStats({ reviewed: 0, correct: 0 }); setHistory([]); }}>{t('studyMore')}</Button>
          <Button size="lg" block onClick={() => nav(-1)}>{t('backToDeck')}</Button>
        </div>
      </div>
    );
  }

  if (!card) return null;
  const progress = (pos / Math.max(total.current, queue.length)) * 100;
  const ratingBtns: { r: Rating; label: string; cls: string }[] = [
    { r: 1, label: t('again'), cls: 'bg-rose-500 shadow-rose-500/30' },
    { r: 2, label: t('hard'), cls: 'bg-amber-500 shadow-amber-500/30' },
    { r: 3, label: t('good'), cls: 'bg-emerald-500 shadow-emerald-500/30' },
    { r: 4, label: t('easy'), cls: 'bg-sky-500 shadow-sky-500/30' },
  ];

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col px-4 pb-4 pt-3 safe-bottom sm:pt-6">
      <div className="flex items-center gap-2">
        <IconButton label={t('exitStudy')} onClick={exit}><X size={24} /></IconButton>
        <div className="flex-1"><ProgressBar value={progress} /><p className="mt-1 truncate text-center text-[11px] font-bold opacity-50">{title} · {t('remaining', { n: queue.length - pos })}</p></div>
        <IconButton label={t('undo')} onClick={undo} disabled={!history.length} className="disabled:opacity-25"><Undo2 size={20} /></IconButton>
      </div>
      {item.practice && <p className="mt-2 text-center text-xs font-semibold text-amber-600 dark:text-amber-400">{t('practiceMode')}</p>}

      <div className={cx('flip relative my-4 flex-1', flipped && 'flipped')} style={{ minHeight: 340 }}>
        <div className="flip-inner h-full">
          <button onClick={() => setFlipped(true)} aria-label={t('tapToReveal')} className="flip-face card-surface flex h-full w-full flex-col rounded-[32px] p-6 text-left">
            <CardTop card={card} />
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto py-4 text-center">
              {card.image && <img src={card.image} alt="" className="mb-4 max-h-44 rounded-2xl object-contain" />}
              <p className="whitespace-pre-wrap break-words text-[26px] font-extrabold leading-snug">{card.front}</p>
            </div>
            <p className="text-center text-sm font-semibold opacity-40">{t('tapToReveal')}</p>
          </button>
          <div className="flip-face flip-back card-surface flex flex-col rounded-[32px] p-6" onClick={() => setFlipped(false)}>
            <CardTop card={card} />
            <div className="flex-1 overflow-y-auto py-3">
              <p className="whitespace-pre-wrap break-words text-center text-base font-semibold opacity-50">{card.front}</p>
              <div className="mx-auto my-4 h-px w-16 bg-ink-900/10 dark:bg-white/10" />
              <p className="whitespace-pre-wrap break-words text-center text-[24px] font-extrabold leading-snug text-brand-600 dark:text-brand-300">{card.back}</p>
              {card.example && <div className="mt-5 rounded-2xl bg-ink-900/[.04] p-4 text-[15px] italic leading-relaxed dark:bg-white/5">“{card.example}”</div>}
              {card.explanation && <div className="mt-3 flex gap-2 rounded-2xl bg-amber-50 p-4 text-sm leading-relaxed text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"><Lightbulb size={18} className="mt-0.5 shrink-0" />{card.explanation}</div>}
            </div>
          </div>
        </div>
      </div>

      {!flipped ? (
        <Button size="lg" block className="h-16 text-lg" onClick={() => setFlipped(true)}>{t('showAnswer')}</Button>
      ) : (
        <div className="animate-fade">
          <p className="mb-2 text-center text-xs font-bold uppercase tracking-wide opacity-45">{t('howWell')}</p>
          <div className="grid grid-cols-4 gap-2">
            {ratingBtns.map((b) => (
              <button key={b.r} onClick={() => rate(b.r)} className={cx('flex h-16 flex-col items-center justify-center rounded-2xl font-extrabold text-white shadow-lg transition active:scale-95', b.cls)}>
                <span className="text-[15px]">{b.label}</span>
                {labels && <span className="text-[11px] font-bold opacity-80">{labels[b.r - 1]}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  function CardTop({ card }: { card: Card }) {
    return (
      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase', card.status === 'new' ? 'bg-sky-500/10 text-sky-600 dark:text-sky-300' : 'bg-amber-500/10 text-amber-600 dark:text-amber-300')}>{t(card.status === 'new' ? 'newCards' : card.status === 'review' ? 'review' : 'learning')}</span>
        <div className="-mr-2 flex">
          {data.settings.tts && <span role="button" tabIndex={0} aria-label={t('listen')} onClick={() => speak(flipped ? card.back : card.front)} className="grid h-9 w-9 place-items-center rounded-xl opacity-50 hover:bg-ink-900/5 hover:opacity-100"><Volume2 size={18} /></span>}
          <span role="button" tabIndex={0} aria-label={t('edit')} onClick={() => { finish(); nav(`/card/${card.id}/edit`); }} className="grid h-9 w-9 place-items-center rounded-xl opacity-50 hover:bg-ink-900/5 hover:opacity-100"><Pencil size={17} /></span>
          <span role="button" tabIndex={0} aria-label={t('bookmark')} onClick={() => updateCard(card.id, { bookmarked: !card.bookmarked })} className={cx('grid h-9 w-9 place-items-center rounded-xl hover:bg-ink-900/5', card.bookmarked ? 'text-amber-500' : 'opacity-50')}><Bookmark size={18} className={card.bookmarked ? 'fill-current' : ''} /></span>
          <span role="button" tabIndex={0} aria-label={t('markDifficult')} onClick={() => updateCard(card.id, { difficult: !card.difficult })} className={cx('grid h-9 w-9 place-items-center rounded-xl hover:bg-ink-900/5', card.difficult ? 'text-rose-500' : 'opacity-50')}><AlertTriangle size={18} /></span>
        </div>
      </div>
    );
  }
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="card-surface rounded-3xl p-3"><div className="mb-1 flex justify-center text-brand-500">{icon}</div><div className="text-lg font-extrabold">{value}</div><div className="text-[11px] font-semibold opacity-55">{label}</div></div>;
}
