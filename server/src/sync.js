import { Router } from 'express';
import { q, tx } from './db.js';
import { requireAuth } from './auth.js';

// Columns the client may write, per table. user_id is always taken from the token.
const TABLES = {
  folders: ['id', 'name', 'color', 'emoji', 'created_at', 'updated_at'],
  decks: ['id', 'title', 'description', 'category', 'folder_id', 'cover', 'color', 'image', 'source_public_id', 'parent_id', 'archived', 'preset', 'style', 'tts_front', 'tts_back', 'sort_order', 'algorithm', 'offline', 'created_at', 'updated_at'],
  flashcards: ['id', 'deck_id', 'note_id', 'card_type', 'extra', 'frozen', 'front', 'back', 'example', 'explanation', 'image', 'difficult', 'bookmarked', 'reps', 'lapses', 'ease', 'interval', 'due', 'last_review', 'status', 'step', 'stability', 'difficulty', 'created_at', 'updated_at'],
  review_logs: ['id', 'card_id', 'deck_id', 'rating', 'ts', 'duration_ms', 'prev_status', 'prev_interval', 'new_interval'],
  study_sessions: ['id', 'deck_id', 'started_at', 'ended_at', 'duration_ms', 'cards_reviewed', 'correct'],
  user_settings: ['data', 'updated_at'],
  saved_public_decks: ['public_deck_id'],
};
const CONFLICT = { user_settings: ['user_id'], saved_public_decks: ['user_id', 'public_deck_id'] };
const KNOWN_CATS = new Set(['general', 'languages', 'science', 'history', 'geography', 'tech', 'math', 'business', 'medicine', 'exam', 'arts', 'other']);
const qi = (c) => `"${c}"`;

export const syncRouter = Router();
syncRouter.use(requireAuth);

syncRouter.get('/', async (req, res) => {
  const u = [req.userId];
  const [decks, cards, reviews, sessions, folders, settings, saved] = await Promise.all([
    q('select * from decks where user_id=$1', u),
    q('select * from flashcards where user_id=$1', u),
    q('select * from review_logs where user_id=$1 order by ts', u),
    q('select * from study_sessions where user_id=$1 order by started_at', u),
    q('select * from folders where user_id=$1 order by created_at', u),
    q('select data, updated_at from user_settings where user_id=$1', u),
    q('select public_deck_id from saved_public_decks where user_id=$1', u),
  ]);
  res.json({ decks: decks.rows, flashcards: cards.rows, review_logs: reviews.rows, study_sessions: sessions.rows, folders: folders.rows, user_settings: settings.rows, saved_public_decks: saved.rows });
});

/** Apply a batch of offline ops in order: [{ t: 'up'|'del', table, row?, id? }] */
syncRouter.post('/', async (req, res) => {
  const ops = req.body?.ops;
  if (!Array.isArray(ops) || ops.length > 2000) return res.status(400).json({ error: 'ops must be an array (max 2000)' });
  const uid = req.userId;
  const applied = await tx(async (c) => {
    let n = 0;
    for (const op of ops) {
      const cols = TABLES[op?.table];
      if (!cols) throw Object.assign(new Error(`unknown table ${op?.table}`), { status: 400 });
      if (op.t === 'del') {
        if (op.table === 'saved_public_decks') await c.query('delete from saved_public_decks where user_id=$1 and public_deck_id=$2', [uid, String(op.id)]);
        else if (op.table !== 'user_settings') await c.query(`delete from ${op.table} where id=$1 and user_id=$2`, [op.id, uid]);
        n++;
        continue;
      }
      const row = op.row ?? {};
      if (op.table === 'decks' && !KNOWN_CATS.has(row.category)) row.category = 'other';
      if (op.table === 'flashcards') {
        const own = await c.query('select 1 from decks where id=$1 and user_id=$2', [row.deck_id, uid]);
        if (!own.rowCount) continue; // deck was deleted or belongs to someone else
      }
      if (op.table === 'decks' && row.parent_id) {
        if (row.parent_id === row.id) row.parent_id = null;
        else {
          const own = await c.query('select 1 from decks where id=$1 and user_id=$2', [row.parent_id, uid]);
          if (!own.rowCount) row.parent_id = null;
        }
      }
      if ((op.table === 'decks') && row.folder_id) {
        const own = await c.query('select 1 from folders where id=$1 and user_id=$2', [row.folder_id, uid]);
        if (!own.rowCount) row.folder_id = null;
      }
      const use = cols.filter((k) => k in row);
      const names = ['user_id', ...use];
      const vals = [uid, ...use.map((k) => (k === 'data' ? JSON.stringify(row[k]) : row[k]))];
      const conflict = CONFLICT[op.table] ?? ['id'];
      const updates = use.filter((k) => !conflict.includes(k)).map((k) => `${qi(k)}=excluded.${qi(k)}`);
      // last write wins: a device with older data (offline phone, a stale open tab) must not overwrite newer progress
      const newer = use.includes('updated_at') ? ` and (${op.table}.updated_at is null or excluded.updated_at >= ${op.table}.updated_at)` : '';
      const sql = `insert into ${op.table} (${names.map(qi).join(',')}) values (${names.map((_, i) => `$${i + 1}`).join(',')})
        on conflict (${conflict.map(qi).join(',')}) ${updates.length ? `do update set ${updates.join(',')} where ${op.table}.user_id = $1${newer}` : 'do nothing'}`;
      await c.query(sql, vals);
      n++;
    }
    return n;
  });
  res.json({ ok: true, applied });
});
