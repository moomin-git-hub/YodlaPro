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
export function afterAnswer(q: StudyQueue, c: Card, eod = endOfToday()): StudyQueue {
  if ((c.status === 'learning' || c.status === 'relearning') && c.due <= eod && !c.frozen) return { ...q, learn: [...q.learn.filter((l) => l.id !== c.id), { id: c.id, due: c.due }] };
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

  const today = startOfDay(now), eod = endOfToday(now);
  const todayLogs = d.reviews.filter((r) => r.ts >= today);
  const reviewedToday = new Set(todayLogs.map((r) => r.cardId));
  const touchedNotes = new Set(d.cards.filter((c) => reviewedToday.has(c.id)).map((c) => c.noteId ?? c.id));
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
    const logs = todayLogs.filter((r) => r.deckId === deckId);
    const newRoom = Math.max(0, cfg.newPerDay - logs.filter((r) => r.prevStatus === 'new').length);
    const revRoom = Math.max(0, cfg.maxReviewsPerDay - logs.filter((r) => r.prevStatus === 'review').length);
    cards.filter((c) => (c.status === 'learning' || c.status === 'relearning') && c.due <= eod).forEach((c) => learn.push({ id: c.id, due: c.due }));
    due.push(...cards.filter((c) => c.status === 'review' && c.due <= eod).sort((a, b) => a.due - b.due).slice(0, revRoom));
    fresh.push(...cards.filter((c) => c.status === 'new').sort((a, b) => a.createdAt - b.createdAt).filter((c) => {
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
  const today = startOfDay(Date.now());
  const reviewed = new Set(d.reviews.filter((r) => r.ts >= today).map((r) => r.cardId));
  const touched = new Set(d.cards.filter((c) => exclude.has(c.id) || reviewed.has(c.id)).map((c) => c.noteId ?? c.id));
  return d.cards.filter((c) => scope.has(c.deckId) && active.has(c.deckId) && c.status === 'new' && !c.frozen && !exclude.has(c.id))
    .sort((a, b) => a.createdAt - b.createdAt)
    .filter((c) => { const k = c.noteId ?? c.id; if (touched.has(k)) return false; touched.add(k); return true; })
    .slice(0, n).map((c) => ({ id: c.id, mode: 'srs' as const }));
}
