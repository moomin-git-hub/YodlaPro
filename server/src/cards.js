// Server-side study logic for the Telegram bot and reports. Uses the same scheduler as the apps
// (srs.gen.js is generated from src/lib/srs.ts), so a card answered in Telegram behaves exactly like in the app.
import { randomUUID } from 'node:crypto';
import { q, tx } from './db.js';
import { schedule, previewLabel, PRESETS, DEFAULT_CONFIG, startOfDay, endOfToday, formatDuration, isMastered, DAY } from './srs.gen.js';

const ms = (v) => (v == null ? null : new Date(v).getTime());

/** DB row → the Card shape the scheduler expects. */
export const toCard = (r) => ({
  id: r.id, deckId: r.deck_id, front: r.front, back: r.back, example: r.example, explanation: r.explanation, image: r.image,
  status: r.status, step: r.step, ease: r.ease, interval: r.interval, due: ms(r.due), reps: r.reps, lapses: r.lapses,
  lastReview: ms(r.last_review), stability: r.stability ?? 0, difficulty: r.difficulty ?? 0, cardType: r.card_type, noteId: r.note_id,
  extra: r.extra, frozen: r.frozen, difficult: r.difficult, createdAt: ms(r.created_at),
});

export async function settingsOf(userId) {
  const { rows } = await q('select data from user_settings where user_id=$1', [userId]);
  return rows[0]?.data ?? {};
}

/** Same as presetFor() in the apps: the deck's preset with the user's global "new words per day". */
export function presetFor(deck, settings) {
  const id = deck?.preset || settings.defaultPreset || 'standard';
  const base = id === 'custom' ? { ...DEFAULT_CONFIG, ...(settings.customPreset ?? {}) } : PRESETS[id] ?? DEFAULT_CONFIG;
  return { ...base, newPerDay: settings.newPerDay ?? 20 };
}

const STUDYABLE = `f.user_id=$1 and not f.frozen and f.card_type <> 'occlusion' and not d.archived and d.algorithm <> 'fast'`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Optional study scope: a list of deck ids (a deck and its subdecks). Ids are validated, so inlining them is safe. */
const scopeSql = (scope) => (Array.isArray(scope) ? ` and d.id in (${scope.filter((x) => UUID.test(x)).map((x) => `'${x}'`).join(',') || 'null'})` : '');
export const isUuid = (s) => UUID.test(String(s ?? ''));

/** A deck id plus all subdeck ids below it (any depth); [] if the deck isn't the user's. */
export async function deckTree(userId, deckId) {
  const { rows } = await q('select id, parent_id from decks where user_id=$1', [userId]);
  if (!rows.some((r) => r.id === deckId)) return [];
  const out = [deckId];
  for (let i = 0; i < out.length; i++) rows.forEach((r) => { if (r.parent_id === out[i] && !out.includes(r.id)) out.push(r.id); });
  return out;
}

/** All decks with card counts, ordered as a tree (parents first, then their subdecks). */
export async function deckList(userId, now = Date.now()) {
  const { rows } = await q(`select d.id, d.title, d.cover, d.parent_id, d.archived, d.algorithm,
      count(f.*)::int total, count(f.*) filter (where f.status='new')::int fresh,
      count(f.*) filter (where f.status<>'new' and f.due <= $2)::int due
    from decks d left join flashcards f on f.deck_id=d.id and not f.frozen
    where d.user_id=$1 group by d.id order by lower(d.title)`, [userId, new Date(endOfToday(now))]);
  const out = [], seen = new Set();
  const walk = (parent, depth) => rows.filter((r) => (r.parent_id ?? null) === parent && !seen.has(r.id)).forEach((r) => { seen.add(r.id); out.push({ ...r, depth }); walk(r.id, depth + 1); });
  walk(null, 0);
  rows.filter((r) => !seen.has(r.id)).forEach((r) => out.push({ ...r, depth: 0 })); // parent missing
  return out;
}

/** Changes app settings from the server (Telegram / Claude); the newer updatedAt makes every device take them on its next sync. */
export async function updateSettings(userId, patch) {
  const data = { ...patch, updatedAt: Date.now() };
  await q(`insert into user_settings (user_id, data, updated_at) values ($1, $2::jsonb, now())
    on conflict (user_id) do update set data = user_settings.data || excluded.data, updated_at = now()`, [userId, JSON.stringify(data)]);
}

/**
 * The next card to show in Telegram — same priorities as the app: learning cards whose step time has come,
 * then reviews due today, then new words within today's limit (one card per note per day).
 * Returns { card, deck, left } or { waitMs } (a learning card comes back soon) or {} (nothing to study).
 */
export async function nextCard(userId, now = Date.now(), skip = [], scope = null) {
  const settings = await settingsOf(userId);
  const sod = new Date(startOfDay(now)), eod = new Date(endOfToday(now));
  const pick = async (sql, params) => (await q(sql, params)).rows[0];
  const inScope = scopeSql(scope);
  const base = `select f.*, d.title deck_title, d.algorithm, d.preset, d.tts_front from flashcards f join decks d on d.id=f.deck_id where ${STUDYABLE}${inScope} and not (f.id = any($2::uuid[]))`;
  let row = await pick(`${base} and f.status in ('learning','relearning') and f.due <= $3 order by f.due limit 1`, [userId, skip, new Date(now)]);
  if (!row) row = await pick(`${base} and f.status='review' and f.due <= $3 order by f.due limit 1`, [userId, skip, eod]);
  if (!row) {
    // new words: per-deck room left today (cards reset after studying today are new again and do not count)
    const { rows: intro } = await q(`select f.deck_id, count(distinct f.id)::int n from review_logs l join flashcards f on f.id=l.card_id
      where l.user_id=$1 and l.ts >= $2 and l.prev_status='new' and f.status <> 'new' group by f.deck_id`, [userId, sod]);
    const used = Object.fromEntries(intro.map((r) => [r.deck_id, r.n]));
    const { rows: touched } = await q(`select distinct coalesce(f.note_id, f.id) note from review_logs l join flashcards f on f.id=l.card_id
      where l.user_id=$1 and l.ts >= $2 and f.status <> 'new'`, [userId, sod]);
    const touchedNotes = new Set(touched.map((r) => r.note));
    const shuffle = !!settings.shuffle;
    const { rows: fresh } = await q(`${base} and f.status='new' order by ${shuffle ? 'random()' : 'f.created_at'} limit 400`, [userId, skip]);
    const limit = settings.newPerDay ?? 20;
    row = fresh.find((r) => (used[r.deck_id] ?? 0) < limit && !touchedNotes.has(r.note_id ?? r.id));
  }
  if (!row) {
    const soon = await pick(`select min(f.due) due from flashcards f join decks d on d.id=f.deck_id where ${STUDYABLE}${inScope} and f.status in ('learning','relearning') and f.due <= $2`, [userId, eod]);
    return soon?.due ? { waitMs: Math.max(0, ms(soon.due) - now) } : {};
  }
  const left = await dueCount(userId, now, scope);
  const deck = { id: row.deck_id, title: row.deck_title, algorithm: row.algorithm, preset: row.preset, ttsFront: row.tts_front };
  return { card: toCard(row), deck, cfg: presetFor(deck, settings), left };
}

/** Cards waiting today (learning due now + reviews due today + new words within the limit). */
export async function dueCount(userId, now = Date.now(), scope = null) {
  const settings = await settingsOf(userId);
  const inScope = scopeSql(scope);
  const { rows: [r] } = await q(`select
      count(*) filter (where f.status in ('learning','relearning') and f.due <= $2)::int learn,
      count(*) filter (where f.status='review' and f.due <= $3)::int rev
    from flashcards f join decks d on d.id=f.deck_id where ${STUDYABLE}${inScope}`, [userId, new Date(now), new Date(endOfToday(now))]);
  const { rows: decks } = await q(`select d.id, count(f.*) filter (where f.status='new')::int fresh,
      (select count(distinct l.card_id)::int from review_logs l join flashcards c on c.id=l.card_id where l.user_id=$1 and l.deck_id=d.id and l.ts >= $2 and l.prev_status='new' and c.status <> 'new') used
    from decks d left join flashcards f on f.deck_id=d.id and not f.frozen and f.card_type <> 'occlusion'
    where d.user_id=$1 and not d.archived and d.algorithm <> 'fast'${inScope} group by d.id`, [userId, new Date(startOfDay(now))]);
  const limit = settings.newPerDay ?? 20;
  const fresh = decks.reduce((a, d) => a + Math.min(d.fresh, Math.max(0, limit - d.used)), 0);
  return r.learn + r.rev + fresh;
}

/** Answer buttons with the time each rating would give, e.g. ["1m", "15m", "1d", "4d"]. */
export const labels = (card, deck, cfg, now = Date.now()) => [1, 2, 3, 4].map((r) => previewLabel(card, r, deck.algorithm || 'fsrs', cfg, now));

/** Applies a rating like the app does: schedules the card and writes a review log (apps pick it up on sync). */
export async function review(userId, cardId, rating, durationMs = 0, now = Date.now()) {
  return tx(async (c) => {
    const { rows: [row] } = await c.query(`select f.*, d.algorithm, d.preset from flashcards f join decks d on d.id=f.deck_id where f.id=$1 and f.user_id=$2 for update`, [cardId, userId]);
    if (!row) return null;
    const settings = await settingsOf(userId);
    const card = toCard(row);
    const s = schedule(card, rating, row.algorithm || 'fsrs', presetFor({ preset: row.preset }, settings), now);
    await c.query(`update flashcards set status=$3, step=$4, ease=$5, "interval"=$6, due=$7, reps=$8, lapses=$9, stability=$10, difficulty=$11,
        last_review=$12, updated_at=$12 where id=$1 and user_id=$2`,
      [cardId, userId, s.status, s.step, s.ease, s.interval, new Date(s.due), s.reps, s.lapses, s.stability ?? 0, s.difficulty ?? 0, new Date(now)]);
    await c.query(`insert into review_logs (id, user_id, card_id, deck_id, rating, ts, duration_ms, prev_status, prev_interval, new_interval)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [randomUUID(), userId, cardId, row.deck_id, rating, new Date(now), Math.min(durationMs, 600000), row.status, row.interval, s.interval]);
    return { ...s, label: previewLabel(card, rating, row.algorithm || 'fsrs', presetFor({ preset: row.preset }, settings), now) };
  });
}

/** Deck the bot adds cards to: the chosen one, else a "Telegram" deck (created on first use). */
export async function targetDeck(userId, deckId) {
  if (deckId) {
    const { rows } = await q('select id, title from decks where id=$1 and user_id=$2 and not archived', [deckId, userId]);
    if (rows[0]) return rows[0];
  }
  const { rows } = await q(`select id, title from decks where user_id=$1 and title='Telegram' and not archived limit 1`, [userId]);
  if (rows[0]) return rows[0];
  const id = randomUUID(); const now = new Date();
  await q(`insert into decks (id, user_id, title, description, category, cover, color, algorithm, created_at, updated_at)
    values ($1,$2,'Telegram','Cards added from @yodlaPro_bot','languages','✈️','sky','fsrs',$3,$3)`, [id, userId, now]);
  return { id, title: 'Telegram' };
}

const CLOZE_NO = /\{\{c(\d+)::/g;
/** Adds notes; a {{c1::…}} note becomes one cloze card per number (like the apps). Returns the new card ids. */
export async function addCards(userId, deckId, cards) {
  const now = Date.now();
  const ids = [];
  await tx(async (c) => {
    for (const [i, x] of cards.entries()) {
      const front = String(x.front ?? '').trim().slice(0, 2000), back = String(x.back ?? '').trim().slice(0, 4000);
      if (!front) continue;
      const nums = [...new Set([...front.matchAll(CLOZE_NO)].map((m) => +m[1]))].sort((a, b) => a - b);
      const noteId = randomUUID();
      const variants = nums.length ? nums.map((n) => ({ type: 'cloze', extra: JSON.stringify({ c: n }) })) : [{ type: 'basic', extra: '' }];
      for (const [k, v] of variants.entries()) {
        const id = k === 0 ? noteId : randomUUID(); ids.push(id);
        await c.query(`insert into flashcards (id, user_id, deck_id, front, back, example, explanation, note_id, card_type, extra, created_at, updated_at, due)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$11)`,
          [id, userId, deckId, front, back, String(x.example ?? '').trim().slice(0, 2000), String(x.explanation ?? '').trim().slice(0, 4000), noteId, v.type, v.extra, new Date(now + i)]);
      }
    }
  });
  return ids;
}

export async function deleteCards(userId, ids) {
  await q('delete from flashcards where user_id=$1 and id = any($2::uuid[])', [userId, ids]);
}

/** Deletes whole notes (a card together with its reverse / cloze / occlusion siblings). Returns how many cards went. */
export async function deleteNotes(userId, ids) {
  const { rowCount } = await q(`delete from flashcards where user_id=$1 and coalesce(note_id, id) in
    (select coalesce(note_id, id) from flashcards where user_id=$1 and id = any($2::uuid[]))`, [userId, ids]);
  return rowCount;
}

/** Updates a note's content: question / answer / example / explanation go to every sibling card. */
export async function editNote(userId, cardId, patch) {
  const F = { front: 2000, back: 4000, example: 2000, explanation: 4000 };
  const sets = [], vals = [userId, cardId];
  for (const [k, max] of Object.entries(F)) if (typeof patch[k] === 'string') { vals.push(patch[k].trim().slice(0, max)); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length) return 0;
  const { rowCount } = await q(`update flashcards set ${sets.join(',')}, updated_at=now() where user_id=$1 and coalesce(note_id, id) =
    (select coalesce(note_id, id) from flashcards where id=$2 and user_id=$1)`, vals);
  return rowCount;
}

/** Sets flags (bookmarked / difficult / frozen) on a whole note. */
export async function flagNote(userId, cardId, flag, value) {
  if (!['bookmarked', 'difficult', 'frozen'].includes(flag)) return 0;
  const { rowCount } = await q(`update flashcards set ${flag}=$3, updated_at=now() where user_id=$1 and coalesce(note_id, id) =
    (select coalesce(note_id, id) from flashcards where id=$2 and user_id=$1)`, [userId, cardId, !!value]);
  return rowCount;
}

/** Fresh progress: the cards become new again. */
export async function resetCards(userId, ids) {
  await q(`update flashcards set status='new', step=0, reps=0, lapses=0, "interval"=0, ease=2.5, stability=0, difficulty=0, last_review=null,
    due=now(), updated_at=now() where user_id=$1 and id = any($2::uuid[])`, [userId, ids]);
}

/** Creates a deck with the user's default algorithm / preset. */
export async function createDeck(userId, title, extra = {}) {
  const s = await settingsOf(userId);
  const id = randomUUID(), name = String(title ?? '').trim().slice(0, 100) || 'Deck';
  const parent = extra.parentId && (await deckTree(userId, extra.parentId)).length ? extra.parentId : null;
  await q(`insert into decks (id, user_id, title, description, category, cover, color, algorithm, preset, parent_id, created_at, updated_at)
    values ($1,$2,$3,$4,'general',$5,'violet',$6,$7,$8,now(),now())`,
    [id, userId, name, String(extra.description ?? '').slice(0, 500), String(extra.cover || '📘').slice(0, 8), s.defaultAlgorithm || 'fsrs', s.defaultPreset || 'standard', parent]);
  return { id, title: name };
}

/** Deletes a deck with its subdecks and all their cards. Returns the number of decks removed. */
export async function deleteDeck(userId, deckId) {
  const ids = await deckTree(userId, deckId);
  if (!ids.length) return 0;
  await q('delete from decks where user_id=$1 and id = any($2::uuid[])', [userId, ids]);
  return ids.length;
}

/** Search notes by text (question, answer, example, explanation). */
export async function searchCards(userId, text, limit = 20) {
  const like = '%' + String(text).slice(0, 100).replace(/[\\%_]/g, (m) => '\\' + m) + '%';
  const { rows } = await q(`select f.*, d.title deck_title from flashcards f join decks d on d.id=f.deck_id
    where f.user_id=$1 and f.card_type <> 'reverse' and (f.front ilike $2 or f.back ilike $2 or f.example ilike $2 or f.explanation ilike $2)
    order by f.updated_at desc limit 200`, [userId, like]);
  const seen = new Set();
  return rows.filter((r) => { const k = r.note_id ?? r.id; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit).map(toCardWithDeck);
}

/** Cards of a deck (one per note), oldest first, for paging in a list. */
export async function deckCards(userId, deckId, offset = 0, limit = 8) {
  const { rows } = await q(`select distinct on (coalesce(f.note_id, f.id)) f.* from flashcards f where f.user_id=$1 and f.deck_id=$2 and f.card_type <> 'reverse'
    order by coalesce(f.note_id, f.id), f.created_at`, [userId, deckId]);
  rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return { total: rows.length, cards: rows.slice(offset, offset + limit).map(toCard) };
}

/** What happened today: reviews, new words, accuracy, time, hardest words and tomorrow's load. */
export async function todayData(userId, now = Date.now()) {
  const sod = new Date(startOfDay(now)), eod = endOfToday(now);
  const [{ rows: logs }, { rows: [tm] }, { rows: allDays }] = await Promise.all([
    q(`select l.rating, l.prev_status, l.card_id, l.duration_ms, f.front, f.back, f.card_type from review_logs l left join flashcards f on f.id=l.card_id
       where l.user_id=$1 and l.ts >= $2 order by l.ts`, [userId, sod]),
    q(`select count(*) filter (where f.status<>'new' and f.due > $2 and f.due <= $3)::int tomorrow
       from flashcards f join decks d on d.id=f.deck_id where f.user_id=$1 and not f.frozen and not d.archived`, [userId, new Date(eod), new Date(eod + DAY)]),
    q(`select distinct (date_trunc('day', ts at time zone $2)) d from review_logs where user_id=$1`, [userId, process.env.TZ || 'Asia/Tashkent']),
  ]);
  const again = new Map();
  logs.filter((l) => l.rating === 1 && l.front != null).forEach((l) => again.set(l.card_id, { front: l.card_type === 'reverse' ? l.back : l.front, n: (again.get(l.card_id)?.n ?? 0) + 1 }));
  return {
    reviews: logs.length, cards: new Set(logs.map((l) => l.card_id)).size, correct: logs.filter((l) => l.rating >= 3).length,
    learnedNew: new Set(logs.filter((l) => l.prev_status === 'new').map((l) => l.card_id)).size,
    minutes: Math.round(logs.reduce((a, l) => a + (l.duration_ms ?? 0), 0) / 60000),
    hard: [...again.values()].sort((a, b) => b.n - a.n).slice(0, 5), tomorrow: tm.tomorrow,
    streak: streaks(allDays.map((r) => startOfDay(new Date(r.d).getTime() + 12 * 3600_000))),
  };
}

/** Current and longest streak (consecutive study days ending today or yesterday) and active days. */
export function streaks(dayKeys) {
  const days = [...new Set(dayKeys)].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const d of days) { run = prev != null && Math.round((d - prev) / DAY) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  const today = startOfDay(Date.now()), set = new Set(days);
  let cur = 0, d = set.has(today) ? today : today - DAY;
  while (set.has(d)) { cur++; d = startOfDay(d - DAY / 2); }
  return { current: cur, best, active: days.length };
}

/** Everything a report needs, for the last `days` days. */
export async function reportData(userId, days = 7, now = Date.now()) {
  const from = startOfDay(now) - (days - 1) * DAY;
  const [{ rows: [user] }, { rows: logs }, { rows: cards }, { rows: allDays }] = await Promise.all([
    q('select name, email from users where id=$1', [userId]),
    q('select rating, ts, card_id, prev_status from review_logs where user_id=$1 and ts >= $2 order by ts', [userId, new Date(from)]),
    q(`select f.*, d.title deck_title from flashcards f join decks d on d.id=f.deck_id where f.user_id=$1 and not d.archived order by d.title, f.created_at`, [userId]),
    q(`select distinct (date_trunc('day', ts at time zone $2)) d from review_logs where user_id=$1`, [userId, process.env.TZ || 'Asia/Tashkent']),
  ]);
  const st = streaks(allDays.map((r) => startOfDay(new Date(r.d).getTime() + 12 * 3600_000)));
  const daily = Array.from({ length: days }, (_, i) => { const d0 = from + i * DAY; return { day: d0, n: logs.filter((l) => ms(l.ts) >= d0 && ms(l.ts) < d0 + DAY).length }; });
  const lapses = new Map();
  logs.filter((l) => l.rating === 1).forEach((l) => lapses.set(l.card_id, (lapses.get(l.card_id) ?? 0) + 1));
  const C = cards.map(toCardWithDeck);
  const hard = [...C].sort((a, b) => (lapses.get(b.id) ?? 0) - (lapses.get(a.id) ?? 0) || b.lapses - a.lapses || b.difficulty - a.difficulty)
    .filter((c) => c.status !== 'new' && ((lapses.get(c.id) ?? 0) > 0 || c.lapses > 0 || c.difficulty >= 7)).slice(0, 30);
  const upcoming = Array.from({ length: 7 }, (_, i) => { const d0 = startOfDay(now) + (i + 1) * DAY; return { day: d0, n: C.filter((c) => c.status !== 'new' && c.due >= d0 && c.due < d0 + DAY).length }; });
  return {
    user: user ?? { name: '', email: '' }, days, from, now, streak: st, daily, upcoming, hard, cards: C, lapsesInPeriod: lapses,
    reviews: logs.length, correct: logs.filter((l) => l.rating >= 3).length, learnedNew: new Set(logs.filter((l) => l.prev_status === 'new').map((l) => l.card_id)).size,
    totals: { all: C.length, new: C.filter((c) => c.status === 'new').length, learning: C.filter((c) => c.status !== 'new' && !isMastered(c)).length, mastered: C.filter(isMastered).length },
  };
}
const toCardWithDeck = (r) => ({ ...toCard(r), deckTitle: r.deck_title });

export { formatDuration, startOfDay, endOfToday, DAY };
