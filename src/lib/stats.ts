import type { UserData, Card } from './types';
import { DAY, dayKey, startOfDay, isDue, isMastered, endOfToday } from './srs';

export function dayCounts(d: UserData) {
  const m = new Map<string, { reviews: number; correct: number; ms: number }>();
  for (const r of d.reviews) {
    const k = dayKey(r.ts);
    const e = m.get(k) ?? { reviews: 0, correct: 0, ms: 0 };
    e.reviews++; if (r.rating >= 3) e.correct++; e.ms += r.durationMs;
    m.set(k, e);
  }
  return m;
}

export function streaks(d: UserData) {
  const days = new Set(d.reviews.map((r) => dayKey(r.ts)));
  let cur = 0;
  let t = startOfDay(Date.now());
  if (!days.has(dayKey(t))) t -= DAY; // streak still alive if studied yesterday
  while (days.has(dayKey(t))) { cur++; t -= DAY; }
  // best
  const sorted = [...days].map((k) => { const [y, m, dd] = k.split('-').map(Number); return new Date(y, m - 1, dd).getTime(); }).sort((a, b) => a - b);
  let best = 0, run = 0, prev = 0;
  for (const s of sorted) { run = prev && Math.round((s - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = s; }
  return { current: cur, best };
}

export function totalStudyMs(d: UserData) {
  const sessionMs = d.sessions.reduce((a, s) => a + s.durationMs, 0);
  const reviewMs = d.reviews.reduce((a, r) => a + r.durationMs, 0);
  return Math.max(sessionMs, reviewMs);
}

export function todayStats(d: UserData) {
  const s = startOfDay(Date.now());
  const today = d.reviews.filter((r) => r.ts >= s);
  return { reviews: today.length, newIntroduced: today.filter((r) => r.prevStatus === 'new').length, ms: today.reduce((a, r) => a + r.durationMs, 0) };
}

export function deckStats(cards: Card[]) {
  let nw = 0, learning = 0, mastered = 0, due = 0;
  for (const c of cards) {
    if (c.status === 'new') nw++;
    else if (isMastered(c)) mastered++;
    else learning++;
    if (isDue(c)) due++;
  }
  const total = cards.length;
  const progress = total ? Math.round(((mastered + learning * 0.5) / total) * 100) : 0;
  return { total, new: nw, learning, mastered, due, progress };
}

export function forecast(cards: Card[], days = 7) {
  const out: number[] = Array(days).fill(0);
  const base = startOfDay(Date.now());
  for (const c of cards) {
    if (c.status === 'new' || c.frozen) continue;
    const idx = c.due <= endOfToday() ? 0 : Math.floor((startOfDay(c.due) - base) / DAY);
    if (idx >= 0 && idx < days) out[idx]++;
  }
  return out;
}

export function lastNDays(n: number) {
  const out: number[] = [];
  const base = startOfDay(Date.now());
  for (let i = n - 1; i >= 0; i--) out.push(base - i * DAY);
  return out;
}

export const fmtTime = (ms: number, t: (k: 'minutes' | 'hours') => string) => {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} ${t('minutes')}`;
  return `${Math.floor(m / 60)} ${t('hours')} ${m % 60} ${t('minutes')}`;
};
