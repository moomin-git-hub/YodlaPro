import type { Card, UserData } from './types';
import { endOfToday, startOfDay, isHard } from './srs';
import { deckTree, algoFor, presetFor } from './store';

/**
 * Study-session queue (same model as android/…/data/Queue.kt).
 * Learning/relearning cards wait in `learn` until their step time has really passed, so a card answered
 * "Hard · 13m" returns after 13 minutes — never after a few seconds. Immutable → undo is a snapshot.
 */
export type Mode = 'srs' | 'practice' | 'fast';
export interface QItem { id: string; mode: Mode }
export interface Learn { id: string; due: number }
export interface StudyQueue { main: QItem[]; learn: Learn[] }
export type Next = { kind: 'show'; item: QItem; queue: StudyQueue } | { kind: 'wait'; until: number } | { kind: 'done' };

export const queueSize = (q: StudyQueue) => q.main.length + q.learn.length;
export const isEmpty = (q: StudyQueue) => queueSize(q) === 0;

export function nextCard(q: StudyQueue, now: number, force = false): Next {
  const ready = q.learn.filter((l) => l.due <= now).sort((a, b) => a.due - b.due)[0];
  if (ready) return { kind: 'show', item: { id: ready.id, mode: 'srs' }, queue: { ...q, learn: q.learn.filter((l) => l !== ready) } };
  if (q.main.length) return { kind: 'show', item: q.main[0], queue: { ...q, main: q.main.slice(1) } };
  const soon = [...q.learn].sort((a, b) => a.due - b.due)[0];
  if (!soon) return { kind: 'done' };
  return force ? { kind: 'show', item: { id: soon.id, mode: 'srs' }, queue: { ...q, learn: q.learn.filter((l) => l !== soon) } } : { kind: 'wait', until: soon.due };
}

/** After a scheduled answer: keep the card for later today if it is still in learning steps. */
/** Longest learning delay that is still waited for inside one study session. */
export const SESSION_HOLD_MS = 60 * 60_000;
export function afterAnswer(q: StudyQueue, c: Card, eod = endOfToday(), now = Date.now()): StudyQueue {
  // only short steps (Again 1m, Hard 15m) come back within this session; a 12h lapse waits for a later session
  if ((c.status === 'learning' || c.status === 'relearning') && c.due <= Math.min(eod, now + SESSION_HOLD_MS) && !c.frozen) return { ...q, learn: [...q.learn.filter((l) => l.id !== c.id), { id: c.id, due: c.due }] };
  return q;
}

/** Practice / fast review: "Again" shows the card again a few cards later. */
export const requeue = (q: StudyQueue, item: QItem, gap = 3): StudyQueue => { const m = [...q.main]; m.splice(Math.min(m.length, gap), 0, item); return { ...q, main: m }; };

const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

/**
 * Today's queue for a deck (incl. subdecks), "folder:<id>", "all", "difficult" or "bookmarks":
 * reviews due today interleaved with new cards (per-deck preset limits, one new card per note per day);
 * learning cards wait for their step time; fast-review decks give every card, on demand.
 */
export function buildQueue(d: UserData, target: string, practice: boolean, now = Date.now()): StudyQueue {
  const active = new Set(d.decks.filter((x) => !x.archived).map((x) => x.id));
  const scope = target.startsWith('folder:')
    ? new Set(d.decks.filter((x) => x.folderId === target.slice(7) && !x.parentId).flatMap((x) => deckTree(x.id, d.decks)))
    : new Set(deckTree(target, d.decks));
  const pool = (target === 'all' ? d.cards.filter((c) => active.has(c.deckId)) : target === 'difficult' ? d.cards.filter(isHard) : target === 'bookmarks' ? d.cards.filter((c) => c.bookmarked) : d.cards.filter((c) => scope.has(c.deckId)))
    .filter((c) => !c.frozen);
  const mix = <T,>(l: T[]) => (d.settings.shuffle ? shuffle(l) : l);
  if (practice) return { main: mix([...pool].sort((a, b) => a.createdAt - b.createdAt)).map((c) => ({ id: c.id, mode: 'practice' as const })), learn: [] };

  const eod = endOfToday(now);
  const info = todayInfo(d, now);
  const touchedNotes = new Set(info.touchedNotes);
  const shuffleOn = d.settings.shuffle;
  const due: Card[] = [], fresh: Card[] = [], learn: Learn[] = [], fast: Card[] = [];
  const byDeck = new Map<string, Card[]>();
  pool.forEach((c) => byDeck.set(c.deckId, [...(byDeck.get(c.deckId) ?? []), c]));
  for (const [deckId, cards] of byDeck) {
    const deck = d.decks.find((x) => x.id === deckId);
    if (algoFor(deck) === 'fast') {
      if (!['all', 'difficult', 'bookmarks'].includes(target)) fast.push(...[...cards].sort((a, b) => a.createdAt - b.createdAt));
      continue;
    }
    const cfg = presetFor(deck);
    const newRoom = Math.max(0, cfg.newPerDay - (info.newIntroduced.get(deckId) ?? 0));
    const revRoom = Math.max(0, cfg.maxReviewsPerDay - (info.reviewsDone.get(deckId) ?? 0));
    cards.filter((c) => (c.status === 'learning' || c.status === 'relearning') && c.due <= eod).forEach((c) => learn.push({ id: c.id, due: c.due }));
    due.push(...cards.filter((c) => c.status === 'review' && c.due <= eod).sort((a, b) => a.due - b.due).slice(0, revRoom));
    // shuffle on → random new words from the whole deck; off → in deck order
    const candidates = cards.filter((c) => c.status === 'new');
    fresh.push(...(shuffleOn ? shuffle(candidates) : candidates.sort((a, b) => a.createdAt - b.createdAt)).filter((c) => {
      const n = c.noteId ?? c.id;
      if (touchedNotes.has(n)) return false;
      touchedNotes.add(n); return true;
    }).slice(0, newRoom));
  }
  const r = mix(due.sort((a, b) => a.due - b.due)), n = mix(fresh);
  const main: QItem[] = [];
  let i = 0, j = 0;
  while (i < r.length || j < n.length) {
    if (i < r.length) main.push({ id: r[i++].id, mode: 'srs' });
    if (i < r.length) main.push({ id: r[i++].id, mode: 'srs' });
    if (j < n.length) main.push({ id: n[j++].id, mode: 'srs' });
  }
  main.push(...mix(fast).map((c) => ({ id: c.id, mode: 'fast' as const })));
  if (target === 'difficult' || target === 'bookmarks') {
    const inQ = new Set([...main.map((x) => x.id), ...learn.map((x) => x.id)]);
    main.push(...mix(pool.filter((c) => !inQ.has(c.id))).map((c) => ({ id: c.id, mode: 'practice' as const })));
  }
  return { main, learn };
}

/** Number of cards that will come up today (for badges): reviews + learning + new within limits. */
export const todayCount = (d: UserData, target: string) => { const q = buildQueue(d, target, false); return q.main.filter((x) => x.mode === 'srs').length + q.learn.length; };

/** Next [n] new cards of [target] not in the session yet — "learn more" beyond today's limit. */
export function moreNew(d: UserData, target: string, exclude: Set<string>, n = 10): QItem[] {
  const active = new Set(d.decks.filter((x) => !x.archived && algoFor(x) !== 'fast').map((x) => x.id));
  const scope = target === 'all' ? active
    : target === 'difficult' || target === 'bookmarks' ? new Set<string>()
    : target.startsWith('folder:') ? new Set(d.decks.filter((x) => x.folderId === target.slice(7) && !x.parentId).flatMap((x) => deckTree(x.id, d.decks)))
    : new Set(deckTree(target, d.decks));
  const touched = new Set([...todayInfo(d).touchedNotes, ...d.cards.filter((c) => exclude.has(c.id)).map((c) => c.noteId ?? c.id)]);
  const pool = d.cards.filter((c) => scope.has(c.deckId) && active.has(c.deckId) && c.status === 'new' && !c.frozen && !exclude.has(c.id));
  return (d.settings.shuffle ? shuffle(pool) : pool.sort((a, b) => a.createdAt - b.createdAt))
    .filter((c) => { const k = c.noteId ?? c.id; if (touched.has(k)) return false; touched.add(k); return true; })
    .slice(0, n).map((c) => ({ id: c.id, mode: 'srs' as const }));
}

/**
 * What happened today, counted against cards' CURRENT state: a card whose progress was reset after it was
 * studied today is new again and no longer uses up today's new-word limit (same as Repo.todayInfo on Android).
 */
export function todayInfo(d: UserData, now = Date.now()) {
  const today = startOfDay(now);
  const byId = new Map(d.cards.map((c) => [c.id, c]));
  const logs = d.reviews.filter((r) => r.ts >= today);
  const studied = new Map<string, Card>();
  logs.forEach((r) => { const c = byId.get(r.cardId); if (c && c.status !== 'new') studied.set(c.id, c); });
  const newIds = new Set(logs.filter((r) => r.prevStatus === 'new').map((r) => r.cardId));
  const newIntroduced = new Map<string, number>(), reviewsDone = new Map<string, number>();
  studied.forEach((c) => { if (newIds.has(c.id)) newIntroduced.set(c.deckId, (newIntroduced.get(c.deckId) ?? 0) + 1); });
  logs.forEach((r) => { if (r.prevStatus === 'review') reviewsDone.set(r.deckId, (reviewsDone.get(r.deckId) ?? 0) + 1); });
  return { newIntroduced, reviewsDone, touchedNotes: new Set([...studied.values()].map((c) => c.noteId ?? c.id)) };
}
