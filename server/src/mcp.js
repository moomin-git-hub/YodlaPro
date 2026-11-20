// Yodla as a Claude connector (remote MCP server): from any Claude chat the user can say "add these words to my
// Yodla deck", "quiz me", "how did I do today?". Each user gets a private connector URL with a secret token
// (only its SHA-256 hash is stored); the token can be regenerated or revoked from the app.
import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { q } from './db.js';
import { requireAuth } from './auth.js';
import { rateLimit, wrap } from './util.js';
import {
  deckList, deckTree, deckCards, createDeck, addCards, setReverse, deleteNotes, editNote, searchCards, nextCard, review, dueCount,
  todayData, reportData, updateSettings, settingsOf, labels, presetFor, isUuid, toCard,
} from './cards.js';

const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://yodla.onrender.com').replace(/\/$/, '');
const hash = (token) => createHash('sha256').update(String(token)).digest('hex');

/** User behind a connector token (path /mcp/<token> or "Authorization: Bearer <token>"), or null. */
async function userOfToken(token) {
  if (!/^yod_[A-Za-z0-9_-]{20,}$/.test(String(token ?? ''))) return null;
  const { rows: [r] } = await q('update api_tokens set last_used_at=now() where token_hash=$1 returning user_id', [hash(token)]);
  return r?.user_id ?? null;
}

// ---------------- tools ----------------
const plain = (h) => String(h ?? '').replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim();
const out = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
const fail = (message) => ({ content: [{ type: 'text', text: message }], isError: true });
const cardOut = (c, deckTitle) => ({
  id: c.id, deck: deckTitle ?? c.deckTitle, question: plain(c.front), answer: plain(c.back), example: plain(c.example), explanation: plain(c.explanation),
  type: c.cardType ?? 'basic', status: c.frozen ? 'frozen' : c.status, next_review: c.status === 'new' ? null : new Date(c.due).toISOString(),
});
const CardIn = z.object({
  question: z.string().min(1).max(2000).describe('Front side: the word, phrase or question. Cloze deletions like "The {{c1::capital}} of France" are supported.'),
  answer: z.string().max(4000).optional().describe('Back side: translation / answer (may be empty only for cloze cards).'),
  example: z.string().max(2000).optional().describe('Optional example sentence using the word.'),
  explanation: z.string().max(4000).optional().describe('Optional explanation: meaning nuance, usage, grammar or a mnemonic.'),
  reverse: z.boolean().optional().describe('Also create the reverse card (answer → question), for vocabulary. Not for cloze cards.'),
});

/** Finds a deck by id or (case-insensitive) title; creates it when `create` is set. */
async function resolveDeck(userId, deck, create) {
  const name = String(deck ?? '').trim();
  if (!name) {
    const { rows: [d] } = await q(`select id, title from decks where user_id=$1 and title='Claude' and not archived limit 1`, [userId]);
    return d ?? createDeck(userId, 'Claude', { cover: '✨', description: 'Cards added from Claude' });
  }
  if (isUuid(name)) {
    const { rows: [d] } = await q('select id, title from decks where id=$1 and user_id=$2', [name, userId]);
    if (d) return d;
  }
  const { rows } = await q('select id, title from decks where user_id=$1 and lower(title)=lower($2) order by archived, created_at limit 1', [userId, name]);
  if (rows[0]) return rows[0];
  return create ? createDeck(userId, name) : null;
}

/** reg (optional) collects {name, description, shape, run} so the same tools can be served as a plain REST API (ChatGPT Actions). */
function buildServer(userId, reg) {
  const server = new McpServer(
    { name: 'yodla', version: '1.0.0' },
    {
      instructions: 'Yodla is the user\'s spaced-repetition flashcard app (decks of cards with question, answer, example and explanation; FSRS scheduling). '
        + 'Use add_cards to save words/cards the user asks for (always fill example and explanation when it helps learning, in the user\'s language), '
        + 'list_decks to find deck names, search_cards / get_deck_cards to look things up, update_card / delete_cards to change them, '
        + 'get_due_cards + review_card to quiz the user (show the question, wait for their answer, then rate 1=Again 2=Hard 3=Good 4=Easy), '
        + 'reverse=true on add_cards / update_card adds the reverse card (answer → question) when the user wants it, '
        + 'and get_stats for progress. Changes appear in the Yodla apps after their next sync.',
    },
  );

  if (reg) {
    const orig = server.registerTool.bind(server);
    server.registerTool = (name, cfg, run) => { reg.push({ name, description: cfg.description, shape: cfg.inputSchema ?? {}, run }); return orig(name, cfg, run); };
  }

  server.registerTool('list_decks', {
    title: 'List decks', description: 'All of the user\'s decks (with subdecks), card counts and how many reviews are due today.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => {
    const decks = await deckList(userId);
    return out(decks.map((d) => ({ id: d.id, title: d.title, parent_id: d.parent_id, archived: d.archived, cards: d.total, new: d.fresh, due_today: d.due })));
  });

  server.registerTool('create_deck', {
    title: 'Create deck', description: 'Creates a new deck (optionally inside another deck as a subdeck).',
    inputSchema: { title: z.string().min(1).max(100), parent_deck: z.string().optional().describe('Id or title of the parent deck, for a subdeck.') },
  }, async ({ title, parent_deck }) => {
    let parentId;
    if (parent_deck) { const p = await resolveDeck(userId, parent_deck, false); if (!p) return fail(`Parent deck "${parent_deck}" not found.`); parentId = p.id; }
    const d = await createDeck(userId, title, { parentId });
    return out({ created: true, deck: d });
  });

  server.registerTool('add_cards', {
    title: 'Add cards', description: 'Adds one or more flashcards to a deck. The deck is matched by id or title; a missing deck is created. '
      + 'Without a deck the cards go to a deck called "Claude".',
    inputSchema: {
      deck: z.string().max(100).optional().describe('Deck id or title, e.g. "4000 Essential Words".'),
      cards: z.array(CardIn).min(1).max(200),
      reverse: z.boolean().optional().describe('Make reverse cards (answer → question) for all cards that do not say otherwise.'),
    },
  }, async ({ deck, cards, reverse }) => {
    const bad = cards.find((c) => !c.answer?.trim() && !/\{\{c\d+::/.test(c.question));
    if (bad) return fail(`Card "${bad.question}" needs an answer (only cloze cards may leave it empty).`);
    const d = await resolveDeck(userId, deck, true);
    const ids = await addCards(userId, d.id, cards.map((c) => ({ front: c.question, back: c.answer ?? '', example: c.example ?? '', explanation: c.explanation ?? '', reverse: c.reverse ?? reverse ?? false })));
    return out({ added: cards.length, card_ids: ids, deck: { id: d.id, title: d.title } });
  });

  server.registerTool('search_cards', {
    title: 'Search cards', description: 'Finds cards whose question, answer, example or explanation contains the text.',
    inputSchema: { query: z.string().min(1).max(100), limit: z.number().int().min(1).max(50).optional() }, annotations: { readOnlyHint: true },
  }, async ({ query, limit }) => out((await searchCards(userId, query, limit ?? 20)).map((c) => cardOut(c))));

  server.registerTool('get_deck_cards', {
    title: 'Cards of a deck', description: 'Lists the cards of one deck (one entry per note), 50 at a time.',
    inputSchema: { deck: z.string().describe('Deck id or title'), offset: z.number().int().min(0).optional() }, annotations: { readOnlyHint: true },
  }, async ({ deck, offset }) => {
    const d = await resolveDeck(userId, deck, false);
    if (!d) return fail(`Deck "${deck}" not found. Use list_decks.`);
    const r = await deckCards(userId, d.id, offset ?? 0, 50);
    return out({ deck: d, total: r.total, offset: offset ?? 0, cards: r.cards.map((c) => cardOut(c, d.title)) });
  });

  server.registerTool('update_card', {
    title: 'Edit card', description: 'Changes the question, answer, example or explanation of a card (and its reverse/cloze siblings).',
    inputSchema: {
      card_id: z.string().uuid(), question: z.string().min(1).max(2000).optional(), answer: z.string().max(4000).optional(),
      example: z.string().max(2000).optional(), explanation: z.string().max(4000).optional(),
      reverse: z.boolean().optional().describe('true = add the reverse card (answer → question), false = remove it. Basic cards only.'),
    },
  }, async ({ card_id, question, answer, example, explanation, reverse }) => {
    const n = await editNote(userId, card_id, { front: question, back: answer, example, explanation });
    let rv;
    if (reverse !== undefined) { rv = await setReverse(userId, card_id, reverse); if (rv === null) return fail('Reverse is only possible for basic cards.'); }
    return n || rv !== undefined ? out({ updated: n, reverse: rv }) : fail('Card not found (or nothing to change).');
  });

  server.registerTool('delete_cards', {
    title: 'Delete cards', description: 'Deletes cards (whole notes, including reverse/cloze siblings). Ask the user before deleting.',
    inputSchema: { card_ids: z.array(z.string().uuid()).min(1).max(200) }, annotations: { destructiveHint: true },
  }, async ({ card_ids }) => out({ deleted: await deleteNotes(userId, card_ids) }));

  server.registerTool('get_due_cards', {
    title: 'Cards to study now', description: 'The next cards the user should study now (same order and daily limits as the app), for a quiz. '
      + 'Show only the question first; reveal the answer after the user replies, then call review_card.',
    inputSchema: { deck: z.string().optional().describe('Deck id or title to study only that deck (with subdecks).'), limit: z.number().int().min(1).max(20).optional() },
    annotations: { readOnlyHint: true },
  }, async ({ deck, limit }) => {
    let scope = null;
    if (deck) { const d = await resolveDeck(userId, deck, false); if (!d) return fail(`Deck "${deck}" not found.`); scope = await deckTree(userId, d.id); }
    const settings = await settingsOf(userId), now = Date.now(), list = [], skip = [];
    for (let i = 0; i < (limit ?? 10); i++) {
      const n = await nextCard(userId, now, skip, scope);
      if (!n.card) break;
      skip.push(n.card.id);
      const lb = labels(n.card, n.deck, presetFor(n.deck, settings), now);
      list.push({ ...cardOut(n.card, n.deck.title), rating_intervals: { again: lb[0], hard: lb[1], good: lb[2], easy: lb[3] } });
    }
    return out({ due_today: await dueCount(userId, now, scope), cards: list });
  });

  server.registerTool('review_card', {
    title: 'Rate a card', description: 'Records how well the user remembered a card (1 = Again, 2 = Hard, 3 = Good, 4 = Easy) and schedules its next review.',
    inputSchema: { card_id: z.string().uuid(), rating: z.number().int().min(1).max(4) },
  }, async ({ card_id, rating }) => {
    const r = await review(userId, card_id, rating);
    return r ? out({ ok: true, next_review_in: r.label, status: r.status }) : fail('Card not found.');
  });

  server.registerTool('get_stats', {
    title: 'Progress', description: 'Today\'s study summary, streak, card totals and the last 7 days.',
    inputSchema: {}, annotations: { readOnlyHint: true },
  }, async () => {
    const [today, week, due, s] = await Promise.all([todayData(userId), reportData(userId, 7), dueCount(userId), settingsOf(userId)]);
    return out({
      today: { reviews: today.reviews, new_words: today.learnedNew, accuracy_pct: today.reviews ? Math.round((today.correct / today.reviews) * 100) : null, minutes: today.minutes, hard_words: today.hard.map((h) => plain(h.front)) },
      due_now: due, due_tomorrow: today.tomorrow, streak_days: today.streak.current, best_streak: today.streak.best,
      totals: week.totals, last_7_days: week.daily.map((d) => ({ date: new Date(d.day).toISOString().slice(0, 10), reviews: d.n })),
      new_words_per_day: s.newPerDay ?? 20,
    });
  });

  server.registerTool('set_new_words_per_day', {
    title: 'New words per day', description: 'Changes how many new words the user learns per day (0–500).',
    inputSchema: { value: z.number().int().min(0).max(500) },
  }, async ({ value }) => { await updateSettings(userId, { newPerDay: value }); return out({ new_words_per_day: value }); });

  // `search` + `fetch`: the two tools ChatGPT (deep research / company knowledge) expects from a connector.
  server.registerTool('search', {
    title: 'Search', description: 'Searches the user\'s Yodla cards. Returns a list of results with id, title and url; use fetch to read a card.',
    inputSchema: { query: z.string().min(1).max(100) }, annotations: { readOnlyHint: true },
  }, async ({ query }) => {
    const rows = await searchCards(userId, query, 20);
    return { content: [{ type: 'text', text: JSON.stringify({ results: rows.map((c) => ({ id: c.id, title: `${plain(c.front)} — ${plain(c.back)}`.slice(0, 120), url: `${PUBLIC_URL}/#card-${c.id}` })) }) }] };
  });
  server.registerTool('fetch', {
    title: 'Fetch card', description: 'Returns the full text of one Yodla card by id (from search).',
    inputSchema: { id: z.string().uuid() }, annotations: { readOnlyHint: true },
  }, async ({ id }) => {
    const { rows: [c] } = await q('select f.*, d.title deck_title from flashcards f join decks d on d.id=f.deck_id where f.id=$1 and f.user_id=$2', [id, userId]);
    if (!c) return fail('Card not found.');
    const card = { ...toCard(c), deckTitle: c.deck_title };
    const o = cardOut(card);
    const text = `Question: ${o.question}\nAnswer: ${o.answer}${o.example ? `\nExample: ${o.example}` : ''}${o.explanation ? `\nExplanation: ${o.explanation}` : ''}`;
    return { content: [{ type: 'text', text: JSON.stringify({ id, title: o.question, text, url: `${PUBLIC_URL}/#card-${id}`, metadata: { deck: o.deck, status: o.status } }) }] };
  });

  return server;
}

// ---------------- routes ----------------
export const mcpRouter = Router();
const limiter = rateLimit({ windowMs: 60_000, max: 120 });
async function handle(req, res) {
  const token = req.params.token ?? (req.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const userId = await userOfToken(token);
  if (!userId) return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Invalid or revoked Yodla connector link. Create a new one in Yodla → Profile → Claude.' }, id: null });
  if (req.method !== 'POST') return res.status(405).set('Allow', 'POST').json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
  const server = buildServer(userId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true }); // stateless
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
mcpRouter.all('/:token', limiter, wrap(handle));
mcpRouter.all('/', limiter, wrap(handle));

// ---------------- plain REST + OpenAPI (ChatGPT custom GPT "Actions", Gemini function calling, any HTTP client) ----------------
export const connectRouter = Router();
const REST_SKIP = new Set(['search', 'fetch']);
const tools = () => { const reg = []; buildServer(null, reg); return reg.filter((t) => !REST_SKIP.has(t.name)); };
connectRouter.get('/:token/openapi.json', limiter, wrap(async (req, res) => {
  if (!(await userOfToken(req.params.token))) return res.status(401).json({ error: 'Invalid or revoked Yodla link.' });
  const paths = {};
  for (const t of tools()) {
    const schema = zodToJsonSchema(z.object(t.shape), { target: 'openApi3', $refStrategy: 'none' });
    paths[`/api/connect/${req.params.token}/${t.name}`] = { post: {
      operationId: t.name, summary: String(t.description).slice(0, 290),
      requestBody: { required: true, content: { 'application/json': { schema } } },
      responses: { 200: { description: 'Result as JSON', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } } },
    } };
  }
  res.json({ openapi: '3.1.0', info: { title: 'Yodla', version: '1.0.0', description: 'The user\'s Yodla flashcards: add cards (with example and explanation), search, quiz, stats.' }, servers: [{ url: PUBLIC_URL }], paths });
}));
connectRouter.post('/:token/:tool', limiter, wrap(async (req, res) => {
  const userId = await userOfToken(req.params.token);
  if (!userId) return res.status(401).json({ error: 'Invalid or revoked Yodla link.' });
  const reg = []; buildServer(userId, reg);
  const t = reg.find((x) => x.name === req.params.tool && !REST_SKIP.has(x.name));
  if (!t) return res.status(404).json({ error: 'Unknown tool.' });
  const parsed = z.object(t.shape).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  const r = await t.run(parsed.data);
  const text = r.content?.[0]?.text ?? '';
  if (r.isError) return res.status(400).json({ error: text });
  try { res.json(JSON.parse(text)); } catch { res.json({ result: text }); }
}));

/** App side: create / check / revoke the personal connector link. */
export const claudeRouter = Router();
claudeRouter.use(requireAuth);
claudeRouter.get('/', wrap(async (req, res) => {
  const { rows: [r] } = await q('select created_at, last_used_at from api_tokens where user_id=$1', [req.userId]);
  res.json({ active: !!r, createdAt: r ? new Date(r.created_at).getTime() : null, lastUsedAt: r?.last_used_at ? new Date(r.last_used_at).getTime() : null });
}));
claudeRouter.post('/', wrap(async (req, res) => {
  const token = 'yod_' + randomBytes(24).toString('base64url');
  await q(`insert into api_tokens (user_id, token_hash) values ($1,$2)
    on conflict (user_id) do update set token_hash=excluded.token_hash, created_at=now(), last_used_at=null`, [req.userId, hash(token)]);
  res.json({ url: `${PUBLIC_URL}/mcp/${token}` });
}));
claudeRouter.delete('/', wrap(async (req, res) => {
  await q('delete from api_tokens where user_id=$1', [req.userId]);
  res.json({ ok: true });
}));

export const _test = { buildServer, userOfToken, hash };
