import type { Card, Rating } from './types';

// SM-2–inspired scheduler with learning steps (Anki-style).
export const MIN = 60_000;
export const DAY = 86_400_000;
const LEARN_STEPS = [1, 10]; // minutes
const RELEARN_STEPS = [10]; // minutes
const GRADUATE_DAYS = 1;
const EASY_DAYS = 4;
const MIN_EASE = 1.3;
export const MASTERED_DAYS = 21;

export interface Scheduled {
  status: Card['status'];
  step: number;
  ease: number;
  interval: number;
  due: number;
  reps: number;
  lapses: number;
}

function fuzz(days: number, seed: string) {
  if (days < 3) return days;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const f = ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.1; // ±5%
  return Math.max(1, Math.round(days * (1 + f)));
}

export function schedule(card: Card, rating: Rating, now = Date.now()): Scheduled {
  let { status, step, ease, interval, reps, lapses } = card;
  let due = now;
  reps += 1;

  if (status === 'new' || status === 'learning') {
    const steps = LEARN_STEPS;
    if (rating === 1) { step = 0; status = 'learning'; due = now + steps[0] * MIN; }
    else if (rating === 2) {
      status = 'learning';
      const cur = steps[Math.min(step, steps.length - 1)];
      const next = steps[step + 1] ?? cur * 1.5;
      due = now + ((cur + next) / 2) * MIN;
    } else if (rating === 3) {
      step += 1;
      if (step >= steps.length) { status = 'review'; step = 0; interval = GRADUATE_DAYS; due = now + interval * DAY; }
      else { status = 'learning'; due = now + steps[step] * MIN; }
    } else { status = 'review'; step = 0; interval = EASY_DAYS; ease += 0.15; due = now + interval * DAY; }
  } else if (status === 'review') {
    if (rating === 1) {
      lapses += 1; ease = Math.max(MIN_EASE, ease - 0.2);
      interval = Math.max(1, Math.round(interval * 0.2));
      status = 'relearning'; step = 0; due = now + RELEARN_STEPS[0] * MIN;
    } else {
      if (rating === 2) { ease = Math.max(MIN_EASE, ease - 0.15); interval = Math.max(interval + 1, interval * 1.2); }
      else if (rating === 3) interval = Math.max(interval + 1, interval * ease);
      else { ease += 0.15; interval = Math.max(interval + 1, interval * ease * 1.3); }
      interval = fuzz(Math.round(interval), card.id + reps);
      due = now + interval * DAY;
    }
  } else {
    // relearning
    if (rating === 1) { step = 0; due = now + RELEARN_STEPS[0] * MIN; }
    else if (rating === 2) due = now + RELEARN_STEPS[0] * 1.5 * MIN;
    else { status = 'review'; step = 0; if (rating === 4) interval += 1; due = now + interval * DAY; }
  }
  return { status, step, ease: Math.round(ease * 100) / 100, interval, due: Math.round(due), reps, lapses };
}

export function previewLabel(card: Card, rating: Rating, now = Date.now()) {
  const s = schedule(card, rating, now);
  return formatDuration(s.due - now);
}

export function formatDuration(ms: number) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(ms / DAY);
  if (d < 31) return `${d}d`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${(d / 365).toFixed(1)}y`;
}

export const endOfToday = (now = Date.now()) => { const d = new Date(now); d.setHours(23, 59, 59, 999); return d.getTime(); };
export const startOfDay = (ts: number) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };

export const isDue = (c: Card, now = Date.now()) => c.status !== 'new' && (c.status === 'review' ? c.due <= endOfToday(now) : c.due <= now + 20 * MIN);
export const isMastered = (c: Card) => c.status === 'review' && c.interval >= MASTERED_DAYS;
export const isHard = (c: Card) => c.difficult || c.lapses >= 3 || (c.reps > 2 && c.ease < 2);

export function newCardDefaults() {
  return { reps: 0, lapses: 0, ease: 2.5, interval: 0, due: Date.now(), lastReview: null, status: 'new' as const, step: 0 };
}
