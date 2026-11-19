import { Router } from 'express';
import { q, tx } from './db.js';
import { requireAuth } from './auth.js';
import { rateLimit } from './util.js';

export const publicRouter = Router();

publicRouter.get('/', async (_req, res) => {
  const { rows } = await q('select id, title, description, category, cover, color, author, language, saves, card_count from public_decks order by saves desc, created_at desc limit 200');
  res.json(rows);
});

publicRouter.get('/:id/cards', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.json([]);
  const { rows } = await q('select front, back, example, explanation from public_deck_cards where public_deck_id=$1 order by position', [req.params.id]);
  res.json(rows);
});

publicRouter.post('/', requireAuth, rateLimit({ windowMs: 60 * 60_000, max: 10 }), async (req, res) => {
  const { title, description = '', category = 'general', cover = '📘', color = 'violet', cards } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim() || title.length > 100) return res.status(400).json({ error: 'titleRequired' });
  // a cloze card ({{c1::…}}) has no separate answer
  const valid = Array.isArray(cards) ? cards.filter((c) => typeof c?.front === 'string' && c.front.trim() && ((typeof c.back === 'string' && c.back.trim()) || /\{\{c\d+::/.test(c.front))) : [];
  if (valid.length < 3 || valid.length > 2000) return res.status(400).json({ error: 'Need 3–2000 cards' });
  const id = await tx(async (c) => {
    const u = await c.query('select name from users where id=$1', [req.userId]);
    const cat = await c.query('select 1 from categories where id=$1', [category]);
    const { rows } = await c.query(
      'insert into public_decks (owner_id, title, description, category, cover, color, author, card_count) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id',
      [req.userId, title.trim(), String(description).slice(0, 500), cat.rowCount ? category : 'other', String(cover).slice(0, 8), String(color).slice(0, 20), u.rows[0]?.name ?? '', valid.length],
    );
    let i = 0;
    for (const card of valid) {
      await c.query('insert into public_deck_cards (public_deck_id, position, front, back, example, explanation) values ($1,$2,$3,$4,$5,$6)',
        [rows[0].id, i++, card.front.slice(0, 2000), String(card.back ?? '').slice(0, 4000), String(card.example ?? '').slice(0, 2000), String(card.explanation ?? '').slice(0, 4000)]);
    }
    return rows[0].id;
  });
  res.json({ id });
});

publicRouter.post('/:id/save', requireAuth, rateLimit({ windowMs: 60 * 60_000, max: 60 }), async (req, res) => {
  if (/^[0-9a-f-]{36}$/i.test(req.params.id)) await q('update public_decks set saves = saves + 1 where id=$1', [req.params.id]);
  res.json({ ok: true });
});

publicRouter.delete('/:id', requireAuth, async (req, res) => {
  await q('delete from public_decks where id=$1 and owner_id=$2', [req.params.id, req.userId]);
  res.json({ ok: true });
});
