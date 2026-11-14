import express, { Router } from 'express';
import crypto from 'node:crypto';
import { q } from './db.js';
import { requireAuth } from './auth.js';
import { putObject, signedGetUrl, deleteObject, storageEnabled } from './storage.js';
import { rateLimit } from './util.js';

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const UPLOAD_TYPES = { 'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md' };
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_UPLOAD = 20 * 1024 * 1024;

export const filesRouter = Router();
const raw = (limit) => express.raw({ type: () => true, limit });

// Upload an image (raw body, Content-Type = image/*). Returns a stable URL served by /files/:id.
filesRouter.post('/images', requireAuth, rateLimit({ windowMs: 60_000, max: 60 }), raw(MAX_IMAGE), async (req, res) => {
  if (!storageEnabled) return res.status(503).json({ error: 'Object storage is not configured' });
  const mime = String(req.headers['content-type'] ?? '').split(';')[0];
  const ext = IMAGE_TYPES[mime];
  if (!ext) return res.status(415).json({ error: 'Only JPEG, PNG, WebP or GIF images' });
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'Empty body' });
  const id = crypto.randomUUID();
  const key = `users/${req.userId}/images/${id}.${ext}`;
  await putObject(key, req.body, mime);
  await q('insert into files (id, user_id, key, kind, mime, size) values ($1,$2,$3,$4,$5,$6)', [id, req.userId, key, 'image', mime, req.body.length]);
  res.json({ id, url: `${publicBase(req)}/files/${id}` });
});

// Archive an uploaded study document (PDF / notes).
filesRouter.post('/uploads', requireAuth, rateLimit({ windowMs: 60_000, max: 20 }), raw(MAX_UPLOAD), async (req, res) => {
  if (!storageEnabled) return res.status(503).json({ error: 'Object storage is not configured' });
  const mime = String(req.headers['content-type'] ?? '').split(';')[0];
  const ext = UPLOAD_TYPES[mime];
  if (!ext) return res.status(415).json({ error: 'Only PDF, TXT or MD' });
  const name = String(req.headers['x-file-name'] ?? 'file').slice(0, 200);
  const id = crypto.randomUUID();
  const key = `users/${req.userId}/uploads/${id}.${ext}`;
  await putObject(key, req.body, mime);
  await q('insert into files (id, user_id, key, kind, name, mime, size) values ($1,$2,$3,$4,$5,$6,$7)', [id, req.userId, key, 'upload', decodeURIComponent(name), mime, req.body.length]);
  res.json({ id });
});

filesRouter.delete('/files/:id', requireAuth, async (req, res) => {
  const { rows } = await q('delete from files where id=$1 and user_id=$2 returning key', [req.params.id, req.userId]);
  if (rows[0]) await deleteObject(rows[0].key);
  res.json({ ok: true });
});

export function publicBase(req) {
  return (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '') + '/api';
}

// Public image URL used in <img src>. IDs are random UUIDs; we redirect to a short-lived presigned URL.
export const fileServe = Router();
fileServe.get('/files/:id', async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.sendStatus(404);
  const { rows } = await q("select key from files where id=$1 and kind='image'", [req.params.id]);
  if (!rows[0]) return res.sendStatus(404);
  const url = await signedGetUrl(rows[0].key, 6 * 3600);
  res.set('Cache-Control', 'public, max-age=3600');
  res.redirect(302, url);
});
