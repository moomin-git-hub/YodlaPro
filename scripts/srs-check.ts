// Randomized invariant check of the scheduler: run `node --experimental-strip-types scripts/srs-check.ts` (expects "violations 0").
import { schedule, fsrs, PRESETS, DAY, MIN } from '../src/lib/srs.ts';
let bad: string[] = []; let rng = 7; const rnd = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
for (const algo of ['fsrs', 'sm2'] as const) for (const pid of ['standard', 'languages', 'medical', 'exam'] as const) {
  const cfg = PRESETS[pid];
  for (let k = 0; k < 400; k++) {
    let c: any = { id: 'c' + k, status: 'new', step: 0, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, lastReview: null, stability: 0, difficulty: 0 };
    let now = 1760000000000 + Math.floor(rnd() * DAY);
    for (let i = 0; i < 40; i++) {
      const outs = [1, 2, 3, 4].map((r) => schedule(c, r as any, algo, cfg, now));
      const d = outs.map((o) => o.due);
      if (!(d[0] <= d[1] && d[1] <= d[2] && d[2] <= d[3])) bad.push(`${algo}/${pid} order ${c.status} ${d.map((x) => ((x - now) / MIN).toFixed(0))}`);
      if ((d[1] === d[2] || d[2] === d[3]) && d[3] - now < cfg.maxIntervalDays * DAY) bad.push(`${algo}/${pid} equal ${c.status} ${d.map((x) => ((x - now) / MIN).toFixed(0))}`);
      outs.forEach((o) => { if (!(o.due > now) || !Number.isFinite(o.stability) || o.interval > cfg.maxIntervalDays || (algo === 'fsrs' && (o.difficulty < 1 || o.difficulty > 10))) bad.push(`${algo}/${pid} invalid ${JSON.stringify(o)}`); });
      // learner with true recall ≈ FSRS retrievability; sometimes studies early in the day, sometimes late
      const r = c.status === 'review' && c.stability ? fsrs.retrievability(Math.max(0, (now - c.lastReview) / DAY), c.stability) : 0.8;
      const x = rnd(); const rating = x > r ? 1 : x > r * 0.85 ? 2 : x > r * 0.15 ? 3 : 4;
      const s = outs[rating - 1]; c = { ...c, ...s, lastReview: now };
      now = c.due + Math.floor((rnd() - 0.5) * 0.9 * (c.status === 'review' ? DAY : 2 * MIN)) + 1000;
      if (now <= c.lastReview) now = c.lastReview + 1000;
    }
  }
}
console.log('violations', bad.length); console.log([...new Set(bad.map((b) => b.split(' ').slice(0, 2).join(' ')))].slice(0, 10)); console.log(bad.slice(0, 5)); const kinds: Record<string, number> = {}; bad.forEach((b) => { const p = b.split(' '); const k = p[0] + ' ' + p[2]; kinds[k] = (kinds[k] ?? 0) + 1; }); console.log(kinds); console.log(bad.filter((b) => b.includes('sm2')).slice(0, 4));
