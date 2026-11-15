import { useSyncExternalStore } from 'react';
import type { Card, Deck, Folder, ReviewLog, Settings, StudySession, UserData, DraftCard, Rating } from './types';
import { kvGet, kvSet, uid, ls } from './util';
import { api, cloudEnabled, ApiError } from './api';
import type { AuthUser } from './auth';
import { newCardDefaults, schedule, PRESETS, DEFAULT_CONFIG, type Algorithm, type SrsConfig } from './srs';

export const defaultSettings = (): Settings => ({
  dailyGoal: 20, newPerDay: 20, reminderEnabled: false, reminderTime: '20:00',
  lang: ls.get('yodla:lang', detectLang()), theme: ls.get('yodla:theme', 'system'),
  shuffle: false, tts: true, onboarded: false, updatedAt: 0,
});
function detectLang(): Settings['lang'] {
  const n = (navigator.language || 'en').slice(0, 2);
  return n === 'ru' ? 'ru' : n === 'uz' ? 'uz' : 'en';
}
const empty = (): UserData => ({ decks: [], cards: [], reviews: [], sessions: [], folders: [], savedPublic: [], settings: defaultSettings() });

let state: UserData = empty();
let user: AuthUser | null = null;
let ready = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

export const useData = () => useSyncExternalStore(subscribe, () => state);
export const getData = () => state;
export const isReady = () => ready;

// ---------- persistence ----------
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persist() {
  if (!user) return;
  clearTimeout(saveTimer);
  const k = 'data:' + user.id, snap = state;
  saveTimer = setTimeout(() => kvSet(k, snap), 250);
}
window.addEventListener('pagehide', () => { if (user) kvSet('data:' + user.id, state); });

function set(next: Partial<UserData>, ops: Op[] = []) {
  state = { ...state, ...next };
  persist();
  emit();
  if (ops.length) enqueue(ops);
}

// ---------- cloud sync (offline queue) ----------
type Table = 'decks' | 'flashcards' | 'review_logs' | 'study_sessions' | 'folders' | 'user_settings' | 'saved_public_decks';
type Op = { t: 'up' | 'del'; table: Table; row?: Record<string, unknown>; id?: string };
let queue: Op[] = [];
export const syncState = { pending: 0, syncing: false, error: '' as string, lastSync: 0 };

const TIME = new Set(['due', 'lastReview', 'createdAt', 'updatedAt', 'ts', 'startedAt', 'endedAt']);
const snake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function toRow(o: object) {
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) r[snake(k)] = TIME.has(k) && typeof v === 'number' ? new Date(v).toISOString() : v;
  if (user) r.user_id = user.id;
  return r;
}
function fromRow<T>(r: Record<string, unknown>): T {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === 'user_id') continue;
    const ck = camel(k);
    o[ck] = TIME.has(ck) && typeof v === 'string' ? Date.parse(v) : v;
  }
  return o as T;
}

function enqueue(ops: Op[]) {
  if (user?.mode !== 'cloud') return;
  queue.push(...ops);
  kvSet('queue:' + user.id, queue);
  syncState.pending = queue.length;
  scheduleFlush();
}
let flushTimer: ReturnType<typeof setTimeout> | undefined;
const scheduleFlush = () => { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 800); };

/** Upload any inline (offline-created) images to object storage before syncing their rows. */
async function uploadInlineImages(ops: Op[]) {
  for (const op of ops) {
    const img = op.row?.image;
    if (op.t !== 'up' || typeof img !== 'string' || !img.startsWith('data:')) continue;
    let url: string;
    try {
      const blob = await (await fetch(img)).blob();
      url = (await api<{ url: string }>('/images', { raw: blob })).url;
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) throw e; // offline: retry later
      continue; // storage unavailable / rejected: keep the inline image so sync is never blocked
    }
    op.row!.image = url;
    const id = op.row!.id as string;
    if (op.table === 'flashcards') state = { ...state, cards: state.cards.map((c) => (c.id === id && c.image === img ? { ...c, image: url } : c)) };
    if (op.table === 'decks') state = { ...state, decks: state.decks.map((d) => (d.id === id && d.image === img ? { ...d, image: url } : d)) };
  }
}

export async function flush() {
  if (!cloudEnabled || user?.mode !== 'cloud' || syncState.syncing || !queue.length || !navigator.onLine) return;
  syncState.syncing = true; emit();
  try {
    while (queue.length) {
      const batch = queue.slice(0, 400);
      await uploadInlineImages(batch);
      await api('/sync', { body: { ops: batch } });
      queue.splice(0, batch.length);
      kvSet('queue:' + user.id, queue);
    }
    persist();
    syncState.error = ''; syncState.lastSync = Date.now();
  } catch (e) {
    syncState.error = (e as Error).message === 'offline' ? '' : (e as Error).message;
    setTimeout(scheduleFlush, 15_000);
  } finally {
    syncState.syncing = false; syncState.pending = queue.length; emit();
  }
}
window.addEventListener('online', () => scheduleFlush());
// Coming back to the tab (e.g. after studying on the phone): fetch what other devices changed.
let lastPull = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !user || user.mode !== 'cloud' || !navigator.onLine || Date.now() - lastPull < 30_000) return;
  lastPull = Date.now();
  syncNow().catch(() => {});
});

async function pullCloud() {
  if (!cloudEnabled || !user) return;
  type R = Record<string, unknown>[];
  const r = await api<{ decks: R; flashcards: R; review_logs: R; study_sessions: R; folders: R; user_settings: R; saved_public_decks: R }>('/sync');
  if (queue.length) return; // a change was made while downloading: keep it, the next sync brings the rest
  const { decks, flashcards: cards, review_logs: reviews, study_sessions: sessions, folders, user_settings: settings, saved_public_decks: saved } = r;
  const s = settings[0] as { data?: Settings } | undefined;
  set({
    decks: decks.map((r) => fromRow<Deck>(r)),
    cards: cards.map((r) => fromRow<Card>(r)),
    reviews: reviews.map((r) => fromRow<ReviewLog>(r)),
    sessions: sessions.map((r) => fromRow<StudySession>(r)),
    folders: folders.map((r) => fromRow<Folder>(r)),
    savedPublic: saved.map((r) => String(r.public_deck_id)),
    settings: s?.data && s.data.updatedAt >= state.settings.updatedAt ? { ...defaultSettings(), ...s.data } : state.settings,
  });
  syncState.lastSync = Date.now();
}

export async function loadUser(u: AuthUser | null) {
  user = u; ready = false;
  if (!u) { state = empty(); ready = true; emit(); return; }
  const saved = await kvGet<UserData>('data:' + u.id);
  state = saved ? { ...empty(), ...saved, settings: { ...defaultSettings(), ...saved.settings } } : empty();
  queue = (await kvGet<Op[]>('queue:' + u.id)) ?? [];
  syncState.pending = queue.length;
  ready = true; emit();
  if (u.mode === 'cloud' && navigator.onLine) {
    try { await flush(); if (!queue.length) await pullCloud(); } catch (e) { syncState.error = (e as Error).message; emit(); }
  }
}
export async function syncNow() { await flush(); if (!queue.length) await pullCloud().catch((e) => { syncState.error = e.message; }); emit(); }

// ---------- actions ----------
const now = () => Date.now();

export function saveDeck(d: Partial<Deck> & { title: string }): Deck {
  const existing = d.id ? state.decks.find((x) => x.id === d.id) : undefined;
  const deck: Deck = { description: '', category: 'general', folderId: null, parentId: null, algorithm: state.settings.defaultAlgorithm ?? 'fsrs', preset: state.settings.defaultPreset ?? 'standard', cover: '📘', color: 'violet', image: '', sourcePublicId: null, createdAt: now(), ...existing, ...d, id: d.id ?? uid(), updatedAt: now() } as Deck;
  set({ decks: existing ? state.decks.map((x) => (x.id === deck.id ? deck : x)) : [deck, ...state.decks] }, [{ t: 'up', table: 'decks', row: toRow(deck) }]);
  return deck;
}

/** All subdeck ids below a deck (any depth). */
export function descendants(id: string, decks = state.decks): string[] {
  const out: string[] = [];
  const walk = (p: string) => decks.forEach((d) => { if (d.parentId === p && !out.includes(d.id) && d.id !== id) { out.push(d.id); walk(d.id); } });
  walk(id);
  return out;
}
/** Deck + all its subdecks. */
export const deckTree = (id: string, decks = state.decks) => [id, ...descendants(id, decks)];

/** Deletes the deck, all its subdecks and their cards (cards cascade in the DB). */
export function deleteDeck(id: string) {
  const ids = new Set(deckTree(id));
  const n = state.cards.filter((c) => ids.has(c.deckId)).length;
  set(
    { decks: state.decks.filter((d) => !ids.has(d.id)), cards: state.cards.filter((c) => !ids.has(c.deckId)) },
    [...ids].reverse().map((x) => ({ t: 'del' as const, table: 'decks' as const, id: x })),
  );
  return n;
}

export function addCards(deckId: string, drafts: (DraftCard & { image?: string })[]): Card[] {
  const t = now();
  const cards: Card[] = drafts.map((d, i) => withNote({
    id: uid(), deckId, front: d.front.trim(), back: d.back.trim(), example: (d.example ?? '').trim(), explanation: (d.explanation ?? '').trim(),
    image: d.image ?? '', difficult: false, bookmarked: false, ...newCardDefaults(), due: t + i, createdAt: t + i, updatedAt: t,
  }));
  function withNote(c: Card): Card { return { ...c, noteId: c.id, cardType: 'basic' }; }
  set({ cards: [...state.cards, ...cards] }, cards.map((c) => ({ t: 'up', table: 'flashcards', row: toRow(c) })));
  return cards;
}

export function updateCard(id: string, patch: Partial<Card>) {
  let updated: Card | undefined;
  const cards = state.cards.map((c) => (c.id === id ? (updated = { ...c, ...patch, updatedAt: now() }) : c));
  if (updated) set({ cards }, [{ t: 'up', table: 'flashcards', row: toRow(updated) }]);
}

export function deleteCards(ids: string[]) {
  const s = new Set(ids);
  set({ cards: state.cards.filter((c) => !s.has(c.id)) }, ids.map((id) => ({ t: 'del', table: 'flashcards', id })));
}

export function moveCards(ids: string[], deckId: string) {
  const s = new Set(ids), ops: Op[] = [];
  const cards = state.cards.map((c) => { if (!s.has(c.id)) return c; const n = { ...c, deckId, updatedAt: now() }; ops.push({ t: 'up', table: 'flashcards', row: toRow(n) }); return n; });
  set({ cards }, ops);
}

export function resetProgress(ids: string[]) {
  const s = new Set(ids), ops: Op[] = [];
  const cards = state.cards.map((c) => { if (!s.has(c.id)) return c; const n = { ...c, ...newCardDefaults(), updatedAt: now() }; ops.push({ t: 'up', table: 'flashcards', row: toRow(n) }); return n; });
  set({ cards }, ops);
}

export const algoFor = (deck?: Deck): Algorithm => deck?.algorithm ?? 'fsrs';
export function presetFor(deck?: Deck): SrsConfig {
  const id = deck?.preset ?? state.settings.defaultPreset ?? 'standard';
  const base = id === 'custom' ? { ...DEFAULT_CONFIG, ...(state.settings.customPreset ?? {}) } : PRESETS[id as keyof typeof PRESETS] ?? DEFAULT_CONFIG;
  return { ...base, newPerDay: state.settings.newPerDay }; // one global, user-adjustable "new words per day"
}

/** All cards of the same note (forward card + its reverse sibling, cloze siblings…). */
export const noteOf = (c: Card) => state.cards.filter((x) => (x.noteId ?? x.id) === (c.noteId ?? c.id));
export const hasReverse = (c: Card) => noteOf(c).some((x) => x.cardType === 'reverse');

/** Saves a basic note's content to all its cards and adds/removes the reverse sibling. */
export function saveBasicNote(card: Card, patch: Partial<Card>, reversed: boolean) {
  const t = now(), noteId = card.noteId ?? card.id;
  const sib = noteOf(card);
  const ops: Op[] = [];
  const content = { front: patch.front, back: patch.back, example: patch.example, explanation: patch.explanation, image: patch.image, deckId: patch.deckId } as Partial<Card>;
  Object.keys(content).forEach((k) => content[k as keyof Card] === undefined && delete content[k as keyof Card]);
  let cards = state.cards.map((c) => {
    if (!sib.includes(c)) return c;
    const n: Card = { ...c, ...content, ...(c.id === card.id ? patch : {}), noteId, updatedAt: t };
    ops.push({ t: 'up', table: 'flashcards', row: toRow(n) });
    return n;
  });
  const rev = sib.find((x) => x.cardType === 'reverse');
  if (reversed && !rev) {
    const base = cards.find((c) => c.id === card.id)!;
    const n: Card = { ...base, ...newCardDefaults(), id: uid(), noteId, cardType: 'reverse', difficult: false, bookmarked: false, frozen: false, createdAt: t + 1, updatedAt: t };
    cards = [...cards, n]; ops.push({ t: 'up', table: 'flashcards', row: toRow(n) });
  } else if (!reversed && rev) {
    cards = cards.filter((c) => c.id !== rev.id); ops.push({ t: 'del', table: 'flashcards', id: rev.id });
  }
  set({ cards }, ops);
}

/** Copies a note (all its cards) with fresh progress. */
export function duplicateNote(card: Card) {
  const t = now(), noteId = uid();
  const copies = noteOf(card).map((c, i) => ({ ...c, ...newCardDefaults(), id: uid(), noteId, createdAt: t + i, updatedAt: t }));
  set({ cards: [...state.cards, ...copies] }, copies.map((c) => ({ t: 'up' as const, table: 'flashcards' as const, row: toRow(c) })));
}

/** Copies a deck (only its own cards) with fresh progress. */
export function duplicateDeck(id: string) {
  const src = state.decks.find((d) => d.id === id);
  if (!src) return null;
  const copy = saveDeck({ ...src, id: undefined, title: src.title + ' (2)', sourcePublicId: null, createdAt: now() } as unknown as Deck);
  const t = now(), notes = new Map<string, string>();
  const cards = state.cards.filter((c) => c.deckId === id).map((c, i) => {
    const nid = notes.get(c.noteId ?? c.id) ?? uid(); notes.set(c.noteId ?? c.id, nid);
    return { ...c, ...newCardDefaults(), id: uid(), deckId: copy.id, noteId: nid, createdAt: t + i, updatedAt: t };
  });
  set({ cards: [...state.cards, ...cards] }, cards.map((c) => ({ t: 'up' as const, table: 'flashcards' as const, row: toRow(c) })));
  return copy;
}

export function review(cardId: string, rating: Rating, durationMs: number): { prev: Card } | null {
  const c = state.cards.find((x) => x.id === cardId);
  if (!c) return null;
  const deck = state.decks.find((d) => d.id === c.deckId);
  const s = schedule(c, rating, algoFor(deck), presetFor(deck));
  const next: Card = { ...c, ...s, lastReview: now(), updatedAt: now() };
  const log: ReviewLog = { id: uid(), cardId, deckId: c.deckId, rating, ts: now(), durationMs: Math.min(durationMs, 120_000), prevStatus: c.status, prevInterval: c.interval, newInterval: s.interval };
  set(
    { cards: state.cards.map((x) => (x.id === cardId ? next : x)), reviews: [...state.reviews, log] },
    [{ t: 'up', table: 'flashcards', row: toRow(next) }, { t: 'up', table: 'review_logs', row: toRow(log) }],
  );
  return { prev: c };
}

export function undoReview(prev: Card) {
  const last = [...state.reviews].reverse().find((r) => r.cardId === prev.id);
  const reviews = last ? state.reviews.filter((r) => r !== last) : state.reviews;
  const restored = { ...prev, updatedAt: now() };
  set({ cards: state.cards.map((x) => (x.id === prev.id ? restored : x)), reviews },
    [{ t: 'up', table: 'flashcards', row: toRow(restored) }, ...(last ? [{ t: 'del' as const, table: 'review_logs' as const, id: last.id }] : [])]);
}

export function addSession(s: Omit<StudySession, 'id'>) {
  if (s.cardsReviewed === 0) return;
  const ses = { ...s, id: uid() };
  set({ sessions: [...state.sessions, ses] }, [{ t: 'up', table: 'study_sessions', row: toRow(ses) }]);
}

export function updateSettings(p: Partial<Settings>) {
  const settings = { ...state.settings, ...p, updatedAt: now() };
  if (p.lang) ls.set('yodla:lang', p.lang);
  if (p.theme) ls.set('yodla:theme', p.theme);
  set({ settings }, [{ t: 'up', table: 'user_settings', row: { user_id: user?.id, data: settings, updated_at: new Date().toISOString() } }]);
}

export function saveFolder(name: string, id?: string, look: { color?: string; emoji?: string } = {}) {
  const ex = id ? state.folders.find((f) => f.id === id) : undefined;
  const f: Folder = { color: 'violet', emoji: '📁', ...ex, ...look, id: id ?? uid(), name: name.trim(), createdAt: ex?.createdAt ?? now(), updatedAt: now() };
  set({ folders: ex ? state.folders.map((x) => (x.id === f.id ? f : x)) : [...state.folders, f] }, [{ t: 'up', table: 'folders', row: toRow(f) }]);
  return f;
}
export function deleteFolder(id: string) {
  const ops: Op[] = [];
  const decks = state.decks.map((d) => { if (d.folderId !== id) return d; const n = { ...d, folderId: null, updatedAt: now() }; ops.push({ t: 'up', table: 'decks', row: toRow(n) }); return n; });
  set({ folders: state.folders.filter((f) => f.id !== id), decks }, [...ops, { t: 'del', table: 'folders', id }]);
}

export function toggleSavedPublic(pid: string) {
  const has = state.savedPublic.includes(pid);
  set({ savedPublic: has ? state.savedPublic.filter((x) => x !== pid) : [...state.savedPublic, pid] },
    [has ? { t: 'del', table: 'saved_public_decks', id: pid } : { t: 'up', table: 'saved_public_decks', row: { user_id: user?.id, public_deck_id: pid } }]);
  if (!has && user?.mode === 'cloud') api(`/public-decks/${pid}/save`, { method: 'POST' }).catch(() => {});
}

export function exportBackup() {
  return JSON.stringify({ app: 'yodla', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
}
export function importBackup(json: string) {
  const parsed = JSON.parse(json);
  const d: UserData = parsed?.data ?? parsed;
  if (!Array.isArray(d.decks) || !Array.isArray(d.cards)) throw new Error('invalid');
  const keep = <T extends { id: string }>(a: T[], b: T[]): T[] => { const ids = new Set(a.map((x) => x.id)); return [...a, ...b.filter((x) => !ids.has(x.id))]; };
  const next: UserData = {
    decks: keep(d.decks, state.decks), cards: keep(d.cards, state.cards), reviews: keep(d.reviews ?? [], state.reviews),
    sessions: keep(d.sessions ?? [], state.sessions), folders: keep(d.folders ?? [], state.folders),
    savedPublic: Array.from(new Set([...(d.savedPublic ?? []), ...state.savedPublic])), settings: { ...state.settings, ...(d.settings ?? {}) },
  };
  const ops: Op[] = [
    ...d.folders?.map((f) => ({ t: 'up' as const, table: 'folders' as const, row: toRow(f) })) ?? [],
    ...d.decks.map((x) => ({ t: 'up' as const, table: 'decks' as const, row: toRow(x) })),
    ...d.cards.map((x) => ({ t: 'up' as const, table: 'flashcards' as const, row: toRow(x) })),
    ...(d.reviews ?? []).map((x) => ({ t: 'up' as const, table: 'review_logs' as const, row: toRow(x) })),
    ...(d.sessions ?? []).map((x) => ({ t: 'up' as const, table: 'study_sessions' as const, row: toRow(x) })),
  ];
  set(next, ops);
  return { decks: d.decks.length, cards: d.cards.length };
}

export function wipeData() {
  const ops: Op[] = state.decks.map((d) => ({ t: 'del', table: 'decks', id: d.id }));
  ops.push(...state.reviews.map((r) => ({ t: 'del' as const, table: 'review_logs' as const, id: r.id })), ...state.sessions.map((s) => ({ t: 'del' as const, table: 'study_sessions' as const, id: s.id })), ...state.folders.map((f) => ({ t: 'del' as const, table: 'folders' as const, id: f.id })));
  set({ ...empty(), settings: { ...state.settings, onboarded: true } }, ops);
}
