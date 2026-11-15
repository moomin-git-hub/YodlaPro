import type { Card, Rating } from './types';

/**
 * Yodla scheduler — the heart of the app. Three learning algorithms (chosen per deck):
 *
 *  • fsrs — Smart spaced repetition (FSRS-5). Tracks each card's memory Stability (days until recall
 *           probability drops to 90 %) and Difficulty (1–10) and schedules the next review for the moment
 *           recall probability reaches the deck's desired retention.
 *  • sm2  — General spaced repetition (Anki-style SM-2 with ease factor, overdue bonus, interval modifier).
 *  • fast — Fast review: no schedule, cards are always available; ratings are only logged.
 *
 * New and forgotten cards go through short learning steps (minutes) before graduating to day intervals.
 * The same code is ported 1:1 to Kotlin (android/…/data/Srs.kt); test vectors in both keep them identical.
 */

export const MIN = 60_000;
export const DAY = 86_400_000;
export const MASTERED_DAYS = 21;

export type Algorithm = 'fsrs' | 'sm2' | 'fast';
export const ALGORITHMS: Algorithm[] = ['fsrs', 'fast', 'sm2'];

export interface SrsConfig {
  learningSteps: number[]; // minutes
  relearningSteps: number[]; // minutes
  graduatingDays: number; // SM-2
  easyDays: number; // SM-2
  startEase: number; // SM-2
  easyBonus: number; // SM-2
  hardFactor: number; // SM-2
  intervalModifier: number; // SM-2
  lapseFactor: number; // SM-2: new interval after a lapse = old × factor
  maxIntervalDays: number;
  newPerDay: number;
  maxReviewsPerDay: number;
  desiredRetention: number; // FSRS: 0.70 – 0.97
}

export const DEFAULT_CONFIG: SrsConfig = {
  learningSteps: [1, 10], relearningSteps: [10], graduatingDays: 1, easyDays: 4, startEase: 2.5, easyBonus: 1.3, hardFactor: 1.2,
  intervalModifier: 1, lapseFactor: 0.2, maxIntervalDays: 36500, newPerDay: 20, maxReviewsPerDay: 9999, desiredRetention: 0.9,
};

export const PRESETS = {
  standard: DEFAULT_CONFIG,
  languages: { ...DEFAULT_CONFIG, learningSteps: [1, 10, 60], easyDays: 3, easyBonus: 1.2, intervalModifier: 0.9, newPerDay: 25, desiredRetention: 0.9 },
  medical: { ...DEFAULT_CONFIG, learningSteps: [1, 10, 60, 360], relearningSteps: [10, 60], easyDays: 3, easyBonus: 1.15, intervalModifier: 0.8, maxIntervalDays: 180, newPerDay: 15, desiredRetention: 0.92 },
  exam: { ...DEFAULT_CONFIG, learningSteps: [1, 5, 20], relearningSteps: [5], easyDays: 2, easyBonus: 1.2, intervalModifier: 0.7, maxIntervalDays: 30, newPerDay: 40, desiredRetention: 0.88 },
} satisfies Record<string, SrsConfig>;
export type PresetId = keyof typeof PRESETS | 'custom';
export const PRESET_IDS: PresetId[] = ['standard', 'languages', 'medical', 'exam', 'custom'];

// ---------------- FSRS-5 ----------------
export const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export const fsrs = {
  retrievability: (elapsedDays: number, s: number) => Math.pow(1 + (FACTOR * elapsedDays) / s, DECAY),
  intervalFor: (s: number, retention: number) => (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1),
  initS: (g: Rating) => W[g - 1],
  initD: (g: Rating) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10),
  nextD(d: number, g: Rating) {
    const delta = -W[6] * (g - 3);
    const next = d + (delta * (10 - d)) / 9; // linear damping
    return clamp(W[7] * fsrs.initD(4) + (1 - W[7]) * next, 1, 10); // mean reversion
  },
  recallS(d: number, s: number, r: number, g: Rating) {
    const hard = g === 2 ? W[15] : 1, easy = g === 4 ? W[16] : 1;
    return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
  },
  forgetS(d: number, s: number, r: number) {
    return Math.min(W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]), s);
  },
  shortS(s: number, g: Rating) {
    const n = s * Math.exp(W[17] * (g - 3 + W[18]));
    return g >= 3 ? Math.max(n, s) : n;
  },
};

// ---------------- deterministic fuzz (identical in Kotlin) ----------------
/** FNV-1a over UTF-16 code units → [0, 1). */
export function hash01(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 4294967296;
}
/** Anki-style fuzz: ±15 % (2.5–7 d), ±10 % (7–20 d), ±5 % (20 d+). */
export function fuzz(days: number, seed: string, maxI: number) {
  if (days < 2.5) return Math.round(days);
  let delta = 1;
  delta += 0.15 * (Math.min(days, 7) - 2.5);
  if (days > 7) delta += 0.1 * (Math.min(days, 20) - 7);
  if (days > 20) delta += 0.05 * (days - 20);
  const lo = Math.max(2, Math.round(days - delta)), hi = Math.min(maxI, Math.round(days + delta));
  if (hi <= lo) return Math.min(maxI, lo);
  return lo + Math.floor(hash01(seed) * (hi - lo + 1));
}

// ---------------- scheduler ----------------
/**
 * FSRS learning phase (Noji-style, one pass): Again → 1m, Hard → 15m, Good/Easy → leaves learning.
 * A brand-new word graduates conservatively to 1d (Good) / 4d (Easy); from then on FSRS stability decides.
 */
export const FSRS_AGAIN_MIN = 1, FSRS_HARD_MIN = 15, FIRST_GOOD_DAYS = 1, FIRST_EASY_DAYS = 4;
/** A forgotten review card (Again) is relearned in the same session, 10 minutes later. */
export const FSRS_LAPSE_MIN = 10;

export interface Scheduled {
  status: Card['status'];
  step: number;
  ease: number;
  interval: number; // days (0 while in learning)
  due: number;
  reps: number;
  lapses: number;
  stability: number;
  difficulty: number;
}

type CardState = Pick<Card, 'id' | 'status' | 'step' | 'ease' | 'interval' | 'due' | 'reps' | 'lapses' | 'lastReview'> & { stability?: number; difficulty?: number };

const steps = (l: number[]) => (l.length ? l : [1]);
const hardDelay = (st: number[], step: number) =>
  step === 0 ? (st.length > 1 ? (st[0] + st[1]) / 2 : Math.min(st[0] * 1.5, st[0] + 1440)) : st[Math.min(step, st.length - 1)];
const round2 = (x: number) => Math.round(x * 100) / 100;
const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** Enforce hard < good < easy for review intervals, cap, fuzz (same seed for preview and real answer). */
function orderAndFuzz(h: number, g: number, e: number, seed: string, maxI: number): [number, number, number] {
  let hard = clamp(h, 1, maxI), good = clamp(g, 1, maxI), easy = clamp(e, 1, maxI);
  hard = Math.min(hard, good);
  good = Math.max(good, hard + 1);
  easy = Math.max(easy, good + 1);
  hard = Math.min(maxI, fuzz(hard, seed + 'h', maxI));
  good = Math.min(maxI, Math.max(fuzz(good, seed + 'g', maxI), hard + 1));
  easy = Math.min(maxI, Math.max(fuzz(easy, seed + 'e', maxI), good + 1));
  return [hard, good, easy];
}

export function schedule(card: CardState, rating: Rating, algo: Algorithm, cfg: SrsConfig, now = Date.now()): Scheduled {
  const reps = card.reps + 1;
  const base = { status: card.status, step: card.step, ease: card.ease, interval: card.interval, due: card.due, reps, lapses: card.lapses, stability: card.stability ?? 0, difficulty: card.difficulty ?? 0 };
  if (algo === 'fast') {
    // No schedule: the card keeps its state (switching back to FSRS/SM-2 continues where it was).
    return base;
  }
  const maxI = Math.max(1, cfg.maxIntervalDays);
  const seed = card.id + ':' + reps;
  const elapsed = elapsedDays(card, now);
  const learn = steps(cfg.learningSteps), relearn = steps(cfg.relearningSteps);
  const inLearning = card.status === 'new' || card.status === 'learning';
  const inRelearning = card.status === 'relearning';
  const st = inRelearning ? relearn : learn;
  let { status, step, ease, interval, lapses, stability: s, difficulty: d } = base;
  let due = now;

  // ---- memory model update ----
  if (algo === 'fsrs') {
    if (s <= 0 || d <= 0) {
      if (card.status === 'review' && card.interval > 0) {
        // migrate an SM-2 card: stability ≈ current interval, difficulty from ease
        s = Math.max(0.5, card.interval); d = clamp(11 - 2.2 * card.ease, 1, 10);
      } else { s = fsrs.initS(rating); d = fsrs.initD(rating); }
      if (card.status === 'review') ({ s, d } = fsrsUpdate(s, d, elapsed, rating));
    } else ({ s, d } = fsrsUpdate(s, d, elapsed, rating));
  }

  const graduate = (g: 3 | 4): number => {
    if (algo === 'fsrs') {
      const good = Math.max(1, Math.round(fsrs.intervalFor(goodS(), cfg.desiredRetention)));
      const own = Math.max(1, Math.round(fsrs.intervalFor(s, cfg.desiredRetention)));
      return clamp(g === 4 ? Math.max(own, good + 1) : own, 1, maxI);
    }
    return clamp(g === 4 ? cfg.easyDays : cfg.graduatingDays, 1, maxI);
  };
  // stability the card would have if the answer were Good (used to keep Easy > Good when graduating)
  /** Fuzzed graduation interval; Easy always stays at least one day above Good (also after fuzz). */
  const gradFuzz = (g: 3 | 4, goodBase: number, easyBase: number) => {
    const gi = fuzz(goodBase, seed + 'G', maxI);
    return g === 3 ? gi : Math.min(maxI, Math.max(fuzz(easyBase, seed + 'E', maxI), gi + 1));
  };
  const goodS = () => (card.stability && card.stability > 0 && card.difficulty ? fsrsUpdate(card.stability, card.difficulty, elapsed, 3).s : card.status === 'review' && card.interval > 0 ? s : fsrs.initS(3));

  if ((inLearning || inRelearning) && algo === 'fsrs') {
    const lst = inRelearning ? 'relearning' : 'learning';
    if (rating === 1) { step = 0; status = lst; due = now + FSRS_AGAIN_MIN * MIN; }
    else if (rating === 2) { step = 0; status = lst; due = now + FSRS_HARD_MIN * MIN; }
    else {
      const g = rating as 3 | 4;
      interval = inRelearning
        ? gradFuzz(g, clamp(Math.max(1, Math.round(fsrs.intervalFor(goodS(), cfg.desiredRetention))), 1, maxI), graduate(4))
        : Math.min(graduate(g), g === 4 ? FIRST_EASY_DAYS : FIRST_GOOD_DAYS, maxI);
      status = 'review'; step = 0; due = now + interval * DAY;
    }
  } else if (inLearning || inRelearning) {
    if (rating === 1) { step = 0; status = inRelearning ? 'relearning' : 'learning'; due = now + st[0] * MIN; }
    else if (rating === 2) { status = inRelearning ? 'relearning' : 'learning'; due = now + hardDelay(st, step) * MIN; }
    else if (rating === 3 && step + 1 < st.length) { step += 1; status = inRelearning ? 'relearning' : 'learning'; due = now + st[step] * MIN; }
    else {
      // graduate (Good on last step, or Easy)
      const g = rating as 3 | 4;
      if (inRelearning) {
        const base = clamp(Math.max(1, interval), 1, maxI);
        interval = gradFuzz(g, base, base + 1);
      } else {
        interval = gradFuzz(g, graduate(3), graduate(4));
        if (algo === 'sm2' && g === 4) ease += 0.15;
      }
      status = 'review'; step = 0; due = now + interval * DAY;
    }
  } else {
    // review card
    if (rating === 1) {
      lapses += 1;
      if (algo === 'sm2') { ease = Math.max(1.3, ease - 0.2); interval = Math.max(1, Math.round(interval * cfg.lapseFactor)); }
      else interval = clamp(Math.round(fsrs.intervalFor(s, cfg.desiredRetention)), 1, maxI);
      if (algo === 'fsrs') { status = 'relearning'; step = 0; due = now + FSRS_LAPSE_MIN * MIN; }
      else if (cfg.relearningSteps.length) { status = 'relearning'; step = 0; due = now + relearn[0] * MIN; }
      else { status = 'review'; due = now + interval * DAY; }
    } else {
      let h: number, g: number, e: number;
      if (algo === 'fsrs') {
        const sd = (gr: Rating) => fsrsUpdate(card.stability && card.stability > 0 ? card.stability : Math.max(0.5, card.interval), card.difficulty && card.difficulty > 0 ? card.difficulty : clamp(11 - 2.2 * card.ease, 1, 10), elapsed, gr).s;
        h = fsrs.intervalFor(sd(2), cfg.desiredRetention); g = fsrs.intervalFor(sd(3), cfg.desiredRetention); e = fsrs.intervalFor(sd(4), cfg.desiredRetention);
      } else {
        const ivl = Math.max(1, interval);
        const late = Math.max(0, (now - card.due) / DAY);
        h = ivl * cfg.hardFactor * cfg.intervalModifier;
        g = (ivl + late / 2) * ease * cfg.intervalModifier;
        e = (ivl + late) * ease * cfg.easyBonus * cfg.intervalModifier;
        h = Math.max(h, ivl + 1); // a successful review always moves the card forward
      }
      const [hh, gg, ee] = orderAndFuzz(Math.round(h), Math.round(g), Math.round(e), seed, maxI);
      interval = rating === 2 ? hh : rating === 3 ? gg : ee;
      if (algo === 'sm2') ease = rating === 2 ? Math.max(1.3, ease - 0.15) : rating === 4 ? ease + 0.15 : ease;
      status = 'review'; step = 0; due = now + interval * DAY;
    }
  }
  return { status, step, ease: round2(ease), interval, due: Math.round(due), reps, lapses, stability: algo === 'fsrs' ? round4(s) : base.stability, difficulty: algo === 'fsrs' ? round4(d) : base.difficulty };
}

/**
 * Days since the last review, counted in CALENDAR days like FSRS does (a card reviewed at 21:00 and again
 * the next morning is 1 day, not 0.46 — otherwise the same-day formula would wrongly be used for a due review).
 * Cards with no review history in this app (imported / older data) are assumed to be reviewed on time.
 */
export function elapsedDays(card: Pick<CardState, 'lastReview' | 'status' | 'interval' | 'due'>, now: number) {
  if (card.lastReview) return Math.max(0, Math.round((startOfDay(now) - startOfDay(card.lastReview)) / DAY));
  if (card.status === 'review' && card.interval > 0) return Math.max(0, Math.round(card.interval + (startOfDay(now) - startOfDay(card.due)) / DAY));
  return 0;
}

/** One FSRS memory update: long-term formula after ≥1 day, short-term (same-day) formula otherwise. */
function fsrsUpdate(s: number, d: number, elapsedDays: number, g: Rating) {
  let ns: number;
  if (elapsedDays >= 1) {
    const r = fsrs.retrievability(elapsedDays, s);
    ns = g === 1 ? fsrs.forgetS(d, s, r) : fsrs.recallS(d, s, r, g);
  } else ns = fsrs.shortS(s, g);
  return { s: Math.max(0.01, ns), d: fsrs.nextD(d, g) };
}

export function previewLabel(card: CardState, rating: Rating, algo: Algorithm, cfg: SrsConfig, now = Date.now()) {
  if (algo === 'fast') return '';
  return formatDuration(schedule(card, rating, algo, cfg, now).due - now);
}

export function formatDuration(ms: number) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(ms / DAY);
  if (d < 60) return `${d}d`; // days up to 2 months so Hard/Good/Easy never read the same
  const mo = Math.round(d / 3) / 10; // months, one decimal
  if (mo < 12) return `${mo}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

export const endOfToday = (now = Date.now()) => { const d = new Date(now); d.setHours(23, 59, 59, 999); return d.getTime(); };
export const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

/** Due today: review cards due before end of day; learning cards whose step has elapsed (or will within today). */
export const isDue = (c: Card, now = Date.now()) => !c.frozen && c.status !== 'new' && c.due <= endOfToday(now);
export const isDueNow = (c: Card, now = Date.now()) => !c.frozen && c.status !== 'new' && c.due <= now;
export const isMastered = (c: Card) => c.status === 'review' && c.interval >= MASTERED_DAYS;
export const isHard = (c: Card) => c.difficult || c.lapses >= 3 || (c.difficulty ? c.difficulty >= 8 : c.reps > 2 && c.ease < 2);

/** Probability of recalling the card right now (FSRS cards only). */
export function recallProbability(c: Card, now = Date.now()) {
  if (!c.stability || !c.lastReview) return null;
  return fsrs.retrievability(Math.max(0, (now - c.lastReview) / DAY), c.stability);
}

export function newCardDefaults() {
  return { reps: 0, lapses: 0, ease: 2.5, interval: 0, due: Date.now(), lastReview: null, status: 'new' as const, step: 0, stability: 0, difficulty: 0 };
}
