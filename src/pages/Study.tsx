import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { X, Bookmark, AlertTriangle, Undo2, Volume2, Pencil, Trophy, Target, Clock, Lightbulb, MoreVertical, Hourglass } from 'lucide-react';
import { useData, getData, review, undoReview, updateCard, addSession, algoFor, presetFor } from '../lib/store';
import { buildQueue, nextCard, afterAnswer, requeue, queueSize, isEmpty, moreNew, type StudyQueue, type QItem } from '../lib/queue';
import { CardMenu } from '../components/CardMenu';
import { useT } from '../lib/i18n';
import { previewLabel, endOfToday } from '../lib/srs';
import { fmtTime } from '../lib/stats';
import { Button, IconButton, ProgressBar, Ring } from '../components/ui';
import { cx } from '../lib/util';
import { RichView } from '../components/RichEditor';
import { clozeHtml, clozePlain, plainText } from '../lib/rich';
import type { Card, Rating } from '../lib/types';

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
  type Snap = { prev: Card | null; queue: StudyQueue; current: QItem | null; stats: { reviewed: number; correct: number; done: number } };
  const [queue, setQueue] = useState<StudyQueue>(() => buildQueue(getData(), target, practiceAll));
  const [empty, setEmpty] = useState(() => isEmpty(queue));
  const [current, setCurrent] = useState<QItem | null>(null);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [menu, setMenu] = useState(false);
  const [stats, setStats] = useState({ reviewed: 0, correct: 0, done: 0 });
  const [history, setHistory] = useState<Snap[]>([]);
  const [, tick] = useState(0);
  const started = useRef(Date.now());
  const shownAt = useRef(Date.now());
  const saved = useRef(false);

  /** Show the next card that is really due; learning cards wait for their step time. */
  const advance = useCallback((q: StudyQueue, force = false) => {
    const n = nextCard(q, Date.now(), force);
    if (n.kind === 'show') { setCurrent(n.item); setQueue(n.queue); setWaitUntil(null); setFinished(false); }
    else if (n.kind === 'wait') { setCurrent(null); setQueue(q); setWaitUntil(n.until); setFinished(false); }
    else { setCurrent(null); setQueue(q); setWaitUntil(null); setFinished(true); }
    setFlipped(false); shownAt.current = Date.now();
  }, []);
  useEffect(() => { if (!empty) advance(queue); /* first card */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const item = current;
  const card = item ? data.cards.find((c) => c.id === item.id) : undefined;
  const done = finished;
  const deck = data.decks.find((x) => x.id === target);
  const cardDeck = card ? data.decks.find((x) => x.id === card.deckId) : undefined;
  const title = target.startsWith('folder:') ? (data.folders.find((f) => f.id === target.slice(7))?.name ?? '') : target === 'all' ? t('study') : target === 'difficult' ? t('difficultCards') : target === 'bookmarks' ? t('bookmarks') : deck?.title ?? '';
  const left = queueSize(queue) + (current ? 1 : 0);

  const finish = useCallback(() => {
    if (saved.current || stats.reviewed === 0) return;
    saved.current = true;
    const end = Date.now();
    addSession({ deckId: deck ? deck.id : null, startedAt: started.current, endedAt: end, durationMs: end - started.current, cardsReviewed: stats.reviewed, correct: stats.correct });
  }, [deck, stats]);

  useEffect(() => { if (done) finish(); }, [done, finish]);
  useEffect(() => { if (item && !card) advance(queue); }, [item, card, queue, advance]); // deleted meanwhile
  // waiting for a learning card: count down, then continue automatically
  useEffect(() => {
    if (waitUntil == null) return;
    const id = setInterval(() => { if (Date.now() >= waitUntil) advance(queue); else tick((x) => x + 1); }, 1000);
    return () => clearInterval(id);
  }, [waitUntil, queue, advance]);

  const rate = useCallback((r: Rating) => {
    if (!card || !item || !flipped) return;
    setHistory((h) => [...h.slice(-50), { prev: item.mode === 'practice' ? null : card, queue, current: item, stats }]);
    let q = queue;
    if (item.mode === 'practice') { if (r === 1) q = requeue(q, item); }
    else if (item.mode === 'fast') { review(card.id, r, Date.now() - shownAt.current); if (r === 1) q = requeue(q, item); }
    else {
      review(card.id, r, Date.now() - shownAt.current);
      const updated = getData().cards.find((c) => c.id === card.id);
      if (updated) q = afterAnswer(q, updated, endOfToday());
    }
    setStats((s) => ({ reviewed: s.reviewed + 1, correct: s.correct + (r >= 3 ? 1 : 0), done: s.done + 1 }));
    advance(q);
    if (navigator.vibrate) navigator.vibrate(8);
  }, [card, item, flipped, queue, stats, advance]);

  const undo = useCallback(() => {
    const last = history[history.length - 1];
    if (!last) return;
    if (last.prev) undoReview(last.prev);
    setHistory((h) => h.slice(0, -1));
    setQueue(last.queue); setCurrent(last.current); setStats(last.stats); setWaitUntil(null); setFinished(false); setFlipped(false);
    saved.current = false;
  }, [history]);

  const exit = useCallback(() => { finish(); nav(-1); }, [finish, nav]);
  const rev = card?.cardType === 'reverse';
  const qText = card ? (rev ? card.back : card.front) : '';
  const aText = card ? (rev ? card.front : card.back) : '';

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || menu) return;
      if (e.key === 'Escape') return exit();
      if (done || !card) return;
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setFlipped((f) => !f); }
      else if (['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Rating);
      else if (e.key.toLowerCase() === 'z') undo();
      else if (e.key.toLowerCase() === 'b') updateCard(card.id, { bookmarked: !card.bookmarked });
      else if (e.key.toLowerCase() === 'd') updateCard(card.id, { difficult: !card.difficult });
      else if (e.key.toLowerCase() === 's') speak(plainText(flipped ? aText || clozePlain(card.front) : card.cardType === 'cloze' ? '' : qText));
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [rate, undo, exit, done, card, flipped, menu, qText, aText]);

  const algo = item?.mode === 'srs' ? algoFor(cardDeck) : 'fast';
  const now0 = useMemo(() => Date.now(), [card?.id, card?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = useMemo(() => (card && algo !== 'fast' ? ([1, 2, 3, 4] as Rating[]).map((r) => previewLabel(card, r, algo, presetFor(cardDeck), now0)) : null), [card, algo, cardDeck, now0]);

  if (waitUntil != null) {
    const sec = Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));
    const more = moreNew(data, target, new Set([...queue.main.map((x) => x.id), ...queue.learn.map((x) => x.id)]));
    return (
      <div className="mx-auto flex min-h-full max-w-md animate-fade flex-col items-center justify-center px-6 py-10 text-center">
        <div className="absolute left-4 top-4"><IconButton label={t('exitStudy')} onClick={exit}><X size={24} /></IconButton></div>
        <Ring value={1 - Math.min(1, sec / 600)} size={150} stroke={12}><div><Hourglass className="mx-auto mb-1 text-brand-500" size={24} /><div className="text-3xl font-extrabold tabular-nums">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}</div></div></Ring>
        <h1 className="mt-6 text-2xl font-extrabold">{t('waitTitle')}</h1>
        <p className="mt-2 text-sm opacity-60">{t('waitSub', { n: queue.learn.length })}</p>
        {more.length > 0 && <Button size="lg" block className="mt-8" onClick={() => advance({ ...queue, main: [...more, ...queue.main] })}>{t('learnMoreNew', { n: more.length })}</Button>}
        <div className={cx('flex w-full gap-3', more.length ? 'mt-3' : 'mt-8')}>
          <Button variant="secondary" size="lg" block onClick={() => { setWaitUntil(null); setFinished(true); }}>{t('finishSession')}</Button>
          <Button variant={more.length ? 'secondary' : undefined} size="lg" block onClick={() => advance(queue, true)}>{t('studyNow')}</Button>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="mb-5 grid h-20 w-20 place-items-center rounded-[28px] bg-emerald-100 text-4xl dark:bg-emerald-500/15">🎉</div>
        <h1 className="text-2xl font-extrabold">{t('allCaughtUp')}</h1>
        <p className="mt-2 opacity-60">{t('allCaughtUpSub')}</p>
        <div className="mt-8 flex w-full gap-3">
          <Button variant="secondary" block onClick={() => nav(-1)}>{t('backToDeck')}</Button>
          <Button block onClick={() => { const q = buildQueue(getData(), target, true); if (!isEmpty(q)) { setEmpty(false); advance(q); } }} disabled={isEmpty(buildQueue(data, target, true))}>{t('practice')}</Button>
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
          <Button variant="secondary" size="lg" block onClick={() => { saved.current = false; started.current = Date.now(); const q = buildQueue(getData(), target, false); setStats({ reviewed: 0, correct: 0, done: 0 }); setHistory([]); advance(isEmpty(q) ? buildQueue(getData(), target, true) : q); }}>{t('studyMore')}</Button>
          <Button size="lg" block onClick={() => nav(-1)}>{t('backToDeck')}</Button>
        </div>
      </div>
    );
  }

  if (!card) return null;
  const clozeIdx = (() => { try { return JSON.parse(card.extra || '{}').c ?? 1; } catch { return 1; } })();
  const faces = card.cardType === 'cloze'
    ? { cloze: true, q: clozeHtml(card.front, clozeIdx, false), a: clozeHtml(card.front, clozeIdx, true) }
    : { cloze: false, q: qText, a: aText };
  const progress = (stats.done / Math.max(1, stats.done + left)) * 100;
  const occ = card.cardType === 'occlusion' ? (() => { try { return JSON.parse(card.extra || '{}') as { masks?: { id: string; x: number; y: number; w: number; h: number }[]; t?: string; mode?: string }; } catch { return {}; } })() : null;
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
        <div className="flex-1"><ProgressBar value={progress} /><p className="mt-1 truncate text-center text-[11px] font-bold opacity-50">{title} · {t('remaining', { n: left })}</p></div>
        <IconButton label={t('undo')} onClick={undo} disabled={!history.length} className="disabled:opacity-25"><Undo2 size={20} /></IconButton>
        <IconButton label="Menu" onClick={() => setMenu(true)}><MoreVertical size={20} /></IconButton>
      </div>
      {item?.mode === 'practice' && <p className="mt-2 text-center text-xs font-semibold text-amber-600 dark:text-amber-400">{t('practiceMode')}</p>}
      {item?.mode === 'fast' && <p className="mt-2 text-center text-xs font-semibold text-sky-600 dark:text-sky-400">{t('algoFast')}</p>}
      <CardMenu card={card} data={data} open={menu} onClose={() => setMenu(false)} onGone={() => advance(queue)} onEdit={finish} />

      <div className={cx('flip relative my-4 flex-1', flipped && 'flipped')} style={{ minHeight: 340 }}>
        <div className="flip-inner h-full">
          <div role="button" tabIndex={0} onClick={(e) => { if (!(e.target as HTMLElement).closest('a')) setFlipped(true); }} aria-label={t('tapToReveal')} className="flip-face card-surface flex h-full w-full cursor-pointer flex-col rounded-[32px] p-6 text-left">
            <CardTop card={card} />
            <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto py-4 text-center">
              {occ ? <><RichView html={card.front} className="mb-3 w-full text-lg font-bold" /><Occlusion image={card.image} occ={occ} revealed={false} /></> : <>
                {card.image && <img src={card.image} alt="" className="mb-4 max-h-44 rounded-2xl object-contain" />}
                <RichView html={faces.q} className="w-full text-[26px] font-extrabold leading-snug" />
              </>}
            </div>
            <p className="text-center text-sm font-semibold opacity-40">{t('tapToReveal')}</p>
          </div>
          <div className="flip-face flip-back card-surface flex flex-col rounded-[32px] p-6" onClick={() => setFlipped(false)}>
            <CardTop card={card} />
            <div className="flex-1 overflow-y-auto py-3">
              {occ ? <Occlusion image={card.image} occ={occ} revealed /> : faces.cloze ? <RichView html={faces.a} className="text-center text-[22px] font-bold leading-snug" /> : <>
                <RichView html={qText} className="text-center text-base font-semibold opacity-50" />
                <div className="mx-auto my-4 h-px w-16 bg-ink-900/10 dark:bg-white/10" />
              </>}
              {(!(faces.cloze || occ) || card.back) && <RichView html={occ ? card.back : faces.a} className={cx('text-center leading-snug', faces.cloze || occ ? 'mt-4 text-base' : 'text-[24px] font-extrabold text-brand-600 dark:text-brand-300')} />}
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
          {data.settings.tts && <span role="button" tabIndex={0} aria-label={t('listen')} onClick={() => speak(plainText(flipped ? faces.a || clozePlain(card.front) : faces.q))} className="grid h-9 w-9 place-items-center rounded-xl opacity-50 hover:bg-ink-900/5 hover:opacity-100"><Volume2 size={18} /></span>}
          <span role="button" tabIndex={0} aria-label={t('edit')} onClick={() => { finish(); nav(`/card/${card.id}/edit`); }} className="grid h-9 w-9 place-items-center rounded-xl opacity-50 hover:bg-ink-900/5 hover:opacity-100"><Pencil size={17} /></span>
          <span role="button" tabIndex={0} aria-label={t('bookmark')} onClick={() => updateCard(card.id, { bookmarked: !card.bookmarked })} className={cx('grid h-9 w-9 place-items-center rounded-xl hover:bg-ink-900/5', card.bookmarked ? 'text-amber-500' : 'opacity-50')}><Bookmark size={18} className={card.bookmarked ? 'fill-current' : ''} /></span>
          <span role="button" tabIndex={0} aria-label={t('markDifficult')} onClick={() => updateCard(card.id, { difficult: !card.difficult })} className={cx('grid h-9 w-9 place-items-center rounded-xl hover:bg-ink-900/5', card.difficult ? 'text-rose-500' : 'opacity-50')}><AlertTriangle size={18} /></span>
        </div>
      </div>
    );
  }
}

type Occ = { masks?: { id: string; x: number; y: number; w: number; h: number }[]; t?: string; mode?: string };
/** Image occlusion (cards created on Android): target mask hidden on the front, outlined on the back. */
function Occlusion({ image, occ, revealed }: { image: string; occ: Occ; revealed: boolean }) {
  return (
    <div className="relative mx-auto inline-block max-w-full">
      <img src={image} alt="" className="block max-h-[46vh] max-w-full rounded-2xl" />
      {(occ.masks ?? []).map((m) => {
        const target = m.id === occ.t;
        if (!target && (occ.mode === 'one' || revealed && false)) return null;
        if (!target && occ.mode !== 'all') return null;
        return <div key={m.id} className={cx('absolute rounded-md', target ? (revealed ? 'border-[3px] border-rose-500' : 'bg-rose-500') : 'bg-amber-400')}
          style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}>
          {target && !revealed && <span className="grid h-full place-items-center text-sm font-extrabold text-white">?</span>}
        </div>;
      })}
    </div>
  );
}

function Summary({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return <div className="card-surface rounded-3xl p-3"><div className="mb-1 flex justify-center text-brand-500">{icon}</div><div className="text-lg font-extrabold">{value}</div><div className="text-[11px] font-semibold opacity-55">{label}</div></div>;
}
