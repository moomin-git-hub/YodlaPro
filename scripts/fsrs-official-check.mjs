// Compares Yodla FSRS with the official ts-fsrs 4.x (FSRS-5) on 20 000 random memory states.
// Usage: npm i ts-fsrs@4 in a temp dir; esbuild src/lib/srs.ts --format=esm --outfile=<dir>/srs.mjs; node scripts/fsrs-official-check.mjs <dir>/srs.mjs
import { FSRSAlgorithm, generatorParameters } from 'ts-fsrs';
const ours = await import(process.argv[2] ?? './srs.mjs');
const ref = new FSRSAlgorithm(generatorParameters({ enable_fuzz: false }));
const f = ours.fsrs;
const upd = (s, d, t, g) => { let ns; if (t >= 1) { const r = f.retrievability(t, s); ns = g === 1 ? f.forgetS(d, s, r) : f.recallS(d, s, r, g); } else ns = f.shortS(s, g); return { s: Math.max(0.01, ns), d: f.nextD(d, g) }; };
let rng = 7; const rnd = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
const diffs = {}; let n = 0;
const note = (k, a, b, ctx) => { const rel = Math.abs(a - b) / Math.max(1e-9, Math.abs(b)); if (rel > 1e-6) { diffs[k] ??= { count: 0, max: 0, ex: null }; diffs[k].count++; if (rel > diffs[k].max) { diffs[k].max = rel; diffs[k].ex = { ...ctx, ours: +a.toFixed(4), official: +b.toFixed(4) }; } } };
for (let g = 1; g <= 4; g++) {
  const r = ref.next_state(undefined, 0, g);
  note('init S', f.initS(g), r.stability, { g }); note('init D', f.initD(g), r.difficulty, { g });
}
for (let i = 0; i < 20000; i++) {
  const s = Math.exp(rnd() * 9 - 2.3), d = 1 + rnd() * 9, t = rnd() < 0.2 ? 0 : Math.floor(rnd() * Math.min(1000, s * 4)) + 1, g = 1 + Math.floor(rnd() * 4);
  const o = upd(s, d, t, g), r = ref.next_state({ stability: s, difficulty: d }, t, g); n++;
  note(`stability g=${g} ${t === 0 ? 'same-day' : 'review'}`, o.s, r.stability, { s: +s.toFixed(3), d: +d.toFixed(2), t, g });
  note(`difficulty g=${g}`, o.d, r.difficulty, { s: +s.toFixed(3), d: +d.toFixed(2), t, g });
  note('retrievability', f.retrievability(t, s), ref.forgetting_curve(t, s), { s, t });
  note('interval@0.9', Math.min(36500, Math.max(1, Math.round(f.intervalFor(s, 0.9)))), ref.next_interval(s, 0), { s });
}
console.log('compared', n, 'random memory states'); console.log(Object.keys(diffs).length ? diffs : 'IDENTICAL to official ts-fsrs (FSRS-5)');
