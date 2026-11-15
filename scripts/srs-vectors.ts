// Prints deterministic scheduler scenarios as JSON. Used as golden vectors for the Kotlin port.
// Run: node --experimental-strip-types scripts/srs-vectors.ts > android/app/src/test/resources/srs_vectors.json
import { schedule, PRESETS, DAY, MIN, fsrs, hash01, fuzz, type Algorithm } from '../src/lib/srs.ts';

const T0 = 1_760_000_000_000;
type C = Parameters<typeof schedule>[0];
const fresh = (id: string): C => ({ id, status: 'new', step: 0, ease: 2.5, interval: 0, due: T0, reps: 0, lapses: 0, lastReview: null, stability: 0, difficulty: 0 });
const out: unknown[] = [];

// Walk a card through a sequence of (rating, minutes-after-due) answers.
function walk(name: string, algo: Algorithm, preset: keyof typeof PRESETS, seq: [1 | 2 | 3 | 4, number][]) {
  let c = fresh(name);
  let now = T0;
  const steps: unknown[] = [];
  for (const [r, late] of seq) {
    now = Math.max(now, c.due) + late * MIN;
    const s = schedule(c, r, algo, PRESETS[preset], now);
    steps.push({ r, now, ...s });
    c = { ...c, ...s, lastReview: now };
  }
  out.push({ name, algo, preset, steps });
}
walk('fsrs-good-path', 'fsrs', 'standard', [[3, 0], [3, 0], [3, 0], [3, 0], [3, 0], [3, 0]]);
walk('fsrs-mixed', 'fsrs', 'standard', [[1, 0], [2, 0], [3, 0], [3, 0], [2, 60], [1, 0], [3, 0], [4, 0], [3, 1440 * 3]]);
walk('fsrs-easy', 'fsrs', 'languages', [[4, 0], [4, 0], [3, 0], [2, 0]]);
walk('fsrs-exam-cap', 'fsrs', 'exam', [[3, 0], [3, 0], [3, 0], [4, 0], [4, 0], [4, 0], [4, 0]]);
walk('sm2-path', 'sm2', 'standard', [[3, 0], [3, 0], [3, 0], [3, 2880], [2, 0], [4, 0], [1, 0], [3, 0], [3, 0]]);
walk('sm2-medical', 'sm2', 'medical', [[2, 0], [3, 0], [3, 0], [3, 0], [3, 0], [4, 0], [1, 0], [3, 0], [3, 0]]);
walk('fast', 'fast', 'standard', [[1, 0], [3, 0], [4, 0]]);
console.log(JSON.stringify({
  vectors: out,
  hash: ['', 'a', 'card-1:3h', 'Ünïcødé ✓'].map((s) => [s, hash01(s)]),
  fuzz: [[2, 'x'], [3.4, 'y'], [10, 'z'], [45, 'w'], [400, 'q']].map(([d, s]) => [d, s, fuzz(d as number, s as string, 36500)]),
  retr: [[1, 1], [10, 3.17], [100, 50]].map(([t, s]) => [t, s, fsrs.retrievability(t, s)]),
}, null, 1));
