/**
 * Type-answer checking (same rules as android/…/data/AnswerCheck.kt):
 * case, accents, punctuation and extra spaces are ignored; an answer like "olma, alma; apple"
 * accepts any one of its alternatives. A character diff shows what was right and what was missing.
 */
export interface AnswerDiff { correct: boolean; typed: [string, boolean][]; expected: [string, boolean][]; target: string }

export const normalize = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[ʻ‘’]/g, "'").normalize('NFD')
  .replace(/\p{Mn}+/gu, '').replace(/(?![+#%$€£₽])[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();

/** "olma, alma; apple" accepts any one word/short phrase. A sentence/definition is never split: it must be typed in full. */
export const alternatives = (expected: string) => {
  const parts = expected.split(/[,;/\n]|\s+or\s+|\s+yoki\s+|\s+или\s+/).map((x) => x.trim()).filter(Boolean);
  const short = parts.length > 1 && parts.every((x) => x.split(/\s+/).length <= 3);
  return [...new Set([expected, ...(short ? parts : [])].map((x) => x.trim()).filter(Boolean))];
};

function lcs(a: string, b: string): [number, number][] {
  const n = Math.min(a.length, 300), m = Math.min(b.length, 300);
  if (!n || !m) return [];
  const t = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: [number, number][] = [];
  let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { out.push([i, j]); i++; j++; } else if (t[i + 1][j] >= t[i][j + 1]) i++; else j++; }
  return out;
}

export function checkAnswer(typedRaw: string, expectedRaw: string): AnswerDiff {
  const typed = typedRaw.trim(), alts = alternatives(expectedRaw.trim()), nt = normalize(typed);
  const hit = nt ? alts.find((a) => normalize(a) === nt) : undefined;
  const target = hit ?? alts.reduce((best, a) => (lcs(typed.toLowerCase(), a.toLowerCase()).length * 2 - a.length > lcs(typed.toLowerCase(), best.toLowerCase()).length * 2 - best.length ? a : best), alts[0] ?? expectedRaw.trim());
  const pairs = lcs(typed.toLowerCase(), target.toLowerCase());
  const tOk = new Set(pairs.map((p) => p[0])), eOk = new Set(pairs.map((p) => p[1])), ok = !!hit;
  return { correct: ok, target, typed: [...typed].map((c, i) => [c, ok || tOk.has(i) || /\s/.test(c)]), expected: [...target].map((c, j) => [c, ok || eOk.has(j) || /\s/.test(c)]) };
}
