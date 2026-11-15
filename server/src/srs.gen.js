// GENERATED from src/lib/srs.ts by 'npm run build:srs' — do not edit; the scheduler is shared by web, server (Telegram bot) and (ported) Android.
const MIN = 6e4;
const DAY = 864e5;
const MASTERED_DAYS = 21;
const ALGORITHMS = ["fsrs", "fast", "sm2"];
const DEFAULT_CONFIG = {
  learningSteps: [1, 10],
  relearningSteps: [10],
  graduatingDays: 1,
  easyDays: 4,
  startEase: 2.5,
  easyBonus: 1.3,
  hardFactor: 1.2,
  intervalModifier: 1,
  lapseFactor: 0.2,
  maxIntervalDays: 36500,
  newPerDay: 20,
  maxReviewsPerDay: 9999,
  desiredRetention: 0.9
};
const PRESETS = {
  standard: DEFAULT_CONFIG,
  languages: { ...DEFAULT_CONFIG, learningSteps: [1, 10, 60], easyDays: 3, easyBonus: 1.2, intervalModifier: 0.9, newPerDay: 25, desiredRetention: 0.9 },
  medical: { ...DEFAULT_CONFIG, learningSteps: [1, 10, 60, 360], relearningSteps: [10, 60], easyDays: 3, easyBonus: 1.15, intervalModifier: 0.8, maxIntervalDays: 180, newPerDay: 15, desiredRetention: 0.92 },
  exam: { ...DEFAULT_CONFIG, learningSteps: [1, 5, 20], relearningSteps: [5], easyDays: 2, easyBonus: 1.2, intervalModifier: 0.7, maxIntervalDays: 30, newPerDay: 40, desiredRetention: 0.88 }
};
const PRESET_IDS = ["standard", "languages", "medical", "exam", "custom"];
const W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 46e-4, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621];
const DECAY = -0.5;
const FACTOR = 19 / 81;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const fsrs = {
  retrievability: (elapsedDays2, s) => Math.pow(1 + FACTOR * elapsedDays2 / s, DECAY),
  intervalFor: (s, retention) => s / FACTOR * (Math.pow(retention, 1 / DECAY) - 1),
  initS: (g) => W[g - 1],
  initD: (g) => clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10),
  nextD(d, g) {
    const delta = -W[6] * (g - 3);
    const next = d + delta * (10 - d) / 9;
    return clamp(W[7] * fsrs.initD(4) + (1 - W[7]) * next, 1, 10);
  },
  recallS(d, s, r, g) {
    const hard = g === 2 ? W[15] : 1, easy = g === 4 ? W[16] : 1;
    return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp((1 - r) * W[10]) - 1) * hard * easy);
  },
  forgetS(d, s, r) {
    return Math.min(W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]), s);
  },
  shortS(s, g) {
    const n = s * Math.exp(W[17] * (g - 3 + W[18]));
    return g >= 3 ? Math.max(n, s) : n;
  }
};
function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
function fuzz(days, seed, maxI) {
  if (days < 2.5) return Math.round(days);
  let delta = 1;
  delta += 0.15 * (Math.min(days, 7) - 2.5);
  if (days > 7) delta += 0.1 * (Math.min(days, 20) - 7);
  if (days > 20) delta += 0.05 * (days - 20);
  const lo = Math.max(2, Math.round(days - delta)), hi = Math.min(maxI, Math.round(days + delta));
  if (hi <= lo) return Math.min(maxI, lo);
  return lo + Math.floor(hash01(seed) * (hi - lo + 1));
}
const FSRS_AGAIN_MIN = 1, FSRS_HARD_MIN = 15, FIRST_GOOD_DAYS = 1, FIRST_EASY_DAYS = 4;
const FSRS_LAPSE_MIN = 10;
const steps = (l) => l.length ? l : [1];
const hardDelay = (st, step) => step === 0 ? st.length > 1 ? (st[0] + st[1]) / 2 : Math.min(st[0] * 1.5, st[0] + 1440) : st[Math.min(step, st.length - 1)];
const round2 = (x) => Math.round(x * 100) / 100;
const round4 = (x) => Math.round(x * 1e4) / 1e4;
function orderAndFuzz(h, g, e, seed, maxI) {
  let hard = clamp(h, 1, maxI), good = clamp(g, 1, maxI), easy = clamp(e, 1, maxI);
  hard = Math.min(hard, good);
  good = Math.max(good, hard + 1);
  easy = Math.max(easy, good + 1);
  hard = Math.min(maxI, fuzz(hard, seed + "h", maxI));
  good = Math.min(maxI, Math.max(fuzz(good, seed + "g", maxI), hard + 1));
  easy = Math.min(maxI, Math.max(fuzz(easy, seed + "e", maxI), good + 1));
  return [hard, good, easy];
}
function schedule(card, rating, algo, cfg, now = Date.now()) {
  const reps = card.reps + 1;
  const base = { status: card.status, step: card.step, ease: card.ease, interval: card.interval, due: card.due, reps, lapses: card.lapses, stability: card.stability ?? 0, difficulty: card.difficulty ?? 0 };
  if (algo === "fast") {
    return base;
  }
  const maxI = Math.max(1, cfg.maxIntervalDays);
  const seed = card.id + ":" + reps;
  const elapsed = elapsedDays(card, now);
  const learn = steps(cfg.learningSteps), relearn = steps(cfg.relearningSteps);
  const inLearning = card.status === "new" || card.status === "learning";
  const inRelearning = card.status === "relearning";
  const st = inRelearning ? relearn : learn;
  let { status, step, ease, interval, lapses, stability: s, difficulty: d } = base;
  let due = now;
  if (algo === "fsrs") {
    if (s <= 0 || d <= 0) {
      if (card.status === "review" && card.interval > 0) {
        s = Math.max(0.5, card.interval);
        d = clamp(11 - 2.2 * card.ease, 1, 10);
      } else {
        s = fsrs.initS(rating);
        d = fsrs.initD(rating);
      }
      if (card.status === "review") ({ s, d } = fsrsUpdate(s, d, elapsed, rating));
    } else ({ s, d } = fsrsUpdate(s, d, elapsed, rating));
  }
  const graduate = (g) => {
    if (algo === "fsrs") {
      const good = Math.max(1, Math.round(fsrs.intervalFor(goodS(), cfg.desiredRetention)));
      const own = Math.max(1, Math.round(fsrs.intervalFor(s, cfg.desiredRetention)));
      return clamp(g === 4 ? Math.max(own, good + 1) : own, 1, maxI);
    }
    return clamp(g === 4 ? cfg.easyDays : cfg.graduatingDays, 1, maxI);
  };
  const gradFuzz = (g, goodBase, easyBase) => {
    const gi = fuzz(goodBase, seed + "G", maxI);
    return g === 3 ? gi : Math.min(maxI, Math.max(fuzz(easyBase, seed + "E", maxI), gi + 1));
  };
  const goodS = () => card.stability && card.stability > 0 && card.difficulty ? fsrsUpdate(card.stability, card.difficulty, elapsed, 3).s : card.status === "review" && card.interval > 0 ? s : fsrs.initS(3);
  if ((inLearning || inRelearning) && algo === "fsrs") {
    const lst = inRelearning ? "relearning" : "learning";
    if (rating === 1) {
      step = 0;
      status = lst;
      due = now + FSRS_AGAIN_MIN * MIN;
    } else if (rating === 2) {
      step = 0;
      status = lst;
      due = now + FSRS_HARD_MIN * MIN;
    } else {
      const g = rating;
      interval = inRelearning ? gradFuzz(g, clamp(Math.max(1, Math.round(fsrs.intervalFor(goodS(), cfg.desiredRetention))), 1, maxI), graduate(4)) : Math.min(graduate(g), g === 4 ? FIRST_EASY_DAYS : FIRST_GOOD_DAYS, maxI);
      status = "review";
      step = 0;
      due = now + interval * DAY;
    }
  } else if (inLearning || inRelearning) {
    if (rating === 1) {
      step = 0;
      status = inRelearning ? "relearning" : "learning";
      due = now + st[0] * MIN;
    } else if (rating === 2) {
      status = inRelearning ? "relearning" : "learning";
      due = now + hardDelay(st, step) * MIN;
    } else if (rating === 3 && step + 1 < st.length) {
      step += 1;
      status = inRelearning ? "relearning" : "learning";
      due = now + st[step] * MIN;
    } else {
      const g = rating;
      if (inRelearning) {
        const base2 = clamp(Math.max(1, interval), 1, maxI);
        interval = gradFuzz(g, base2, base2 + 1);
      } else {
        interval = gradFuzz(g, graduate(3), graduate(4));
        if (algo === "sm2" && g === 4) ease += 0.15;
      }
      status = "review";
      step = 0;
      due = now + interval * DAY;
    }
  } else {
    if (rating === 1) {
      lapses += 1;
      if (algo === "sm2") {
        ease = Math.max(1.3, ease - 0.2);
        interval = Math.max(1, Math.round(interval * cfg.lapseFactor));
      } else interval = clamp(Math.round(fsrs.intervalFor(s, cfg.desiredRetention)), 1, maxI);
      if (algo === "fsrs") {
        status = "relearning";
        step = 0;
        due = now + FSRS_LAPSE_MIN * MIN;
      } else if (cfg.relearningSteps.length) {
        status = "relearning";
        step = 0;
        due = now + relearn[0] * MIN;
      } else {
        status = "review";
        due = now + interval * DAY;
      }
    } else {
      let h, g, e;
      if (algo === "fsrs") {
        const sd = (gr) => fsrsUpdate(card.stability && card.stability > 0 ? card.stability : Math.max(0.5, card.interval), card.difficulty && card.difficulty > 0 ? card.difficulty : clamp(11 - 2.2 * card.ease, 1, 10), elapsed, gr).s;
        h = fsrs.intervalFor(sd(2), cfg.desiredRetention);
        g = fsrs.intervalFor(sd(3), cfg.desiredRetention);
        e = fsrs.intervalFor(sd(4), cfg.desiredRetention);
      } else {
        const ivl = Math.max(1, interval);
        const late = Math.max(0, (now - card.due) / DAY);
        h = ivl * cfg.hardFactor * cfg.intervalModifier;
        g = (ivl + late / 2) * ease * cfg.intervalModifier;
        e = (ivl + late) * ease * cfg.easyBonus * cfg.intervalModifier;
        h = Math.max(h, ivl + 1);
      }
      const [hh, gg, ee] = orderAndFuzz(Math.round(h), Math.round(g), Math.round(e), seed, maxI);
      interval = rating === 2 ? hh : rating === 3 ? gg : ee;
      if (algo === "sm2") ease = rating === 2 ? Math.max(1.3, ease - 0.15) : rating === 4 ? ease + 0.15 : ease;
      status = "review";
      step = 0;
      due = now + interval * DAY;
    }
  }
  return { status, step, ease: round2(ease), interval, due: Math.round(due), reps, lapses, stability: algo === "fsrs" ? round4(s) : base.stability, difficulty: algo === "fsrs" ? round4(d) : base.difficulty };
}
function elapsedDays(card, now) {
  if (card.lastReview) return Math.max(0, Math.round((startOfDay(now) - startOfDay(card.lastReview)) / DAY));
  if (card.status === "review" && card.interval > 0) return Math.max(0, Math.round(card.interval + (startOfDay(now) - startOfDay(card.due)) / DAY));
  return 0;
}
function fsrsUpdate(s, d, elapsedDays2, g) {
  let ns;
  if (elapsedDays2 >= 1) {
    const r = fsrs.retrievability(elapsedDays2, s);
    ns = g === 1 ? fsrs.forgetS(d, s, r) : fsrs.recallS(d, s, r, g);
  } else ns = fsrs.shortS(s, g);
  return { s: Math.max(0.01, ns), d: fsrs.nextD(d, g) };
}
function previewLabel(card, rating, algo, cfg, now = Date.now()) {
  if (algo === "fast") return "";
  return formatDuration(schedule(card, rating, algo, cfg, now).due - now);
}
function formatDuration(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(ms / DAY);
  if (d < 60) return `${d}d`;
  const mo = Math.round(d / 3) / 10;
  if (mo < 12) return `${mo}mo`;
  return `${(d / 365).toFixed(1)}y`;
}
const endOfToday = (now = Date.now()) => {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};
const startOfDay = (ts) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const isDue = (c, now = Date.now()) => !c.frozen && c.status !== "new" && c.due <= endOfToday(now);
const isDueNow = (c, now = Date.now()) => !c.frozen && c.status !== "new" && c.due <= now;
const isMastered = (c) => c.status === "review" && c.interval >= MASTERED_DAYS;
const isHard = (c) => c.difficult || c.lapses >= 3 || (c.difficulty ? c.difficulty >= 8 : c.reps > 2 && c.ease < 2);
function recallProbability(c, now = Date.now()) {
  if (!c.stability || !c.lastReview) return null;
  return fsrs.retrievability(Math.max(0, (now - c.lastReview) / DAY), c.stability);
}
function newCardDefaults() {
  return { reps: 0, lapses: 0, ease: 2.5, interval: 0, due: Date.now(), lastReview: null, status: "new", step: 0, stability: 0, difficulty: 0 };
}
export {
  ALGORITHMS,
  DAY,
  DEFAULT_CONFIG,
  FIRST_EASY_DAYS,
  FIRST_GOOD_DAYS,
  FSRS_AGAIN_MIN,
  FSRS_HARD_MIN,
  FSRS_LAPSE_MIN,
  MASTERED_DAYS,
  MIN,
  PRESETS,
  PRESET_IDS,
  W,
  dayKey,
  elapsedDays,
  endOfToday,
  formatDuration,
  fsrs,
  fuzz,
  hash01,
  isDue,
  isDueNow,
  isHard,
  isMastered,
  newCardDefaults,
  previewLabel,
  recallProbability,
  schedule,
  startOfDay
};
