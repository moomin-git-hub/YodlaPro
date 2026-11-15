import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { q } from './db.js';
import { rateLimit } from './util.js';

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) throw new Error('JWT_SECRET must be set (at least 32 random characters)');
const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) && s.length <= 254;
const strong = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 200 && /[A-Za-z]/.test(p) && /\d/.test(p);
export const signToken = (u) => sign(u);
export const publicUser = (u) => pub(u);
const pub = (u) => ({ id: u.id, email: u.email, name: u.name, createdAt: new Date(u.created_at).getTime() });
const sign = (u) => jwt.sign({ sub: u.id }, SECRET, { expiresIn: '60d' });

const mailer = process.env.SMTP_HOST
  ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
  : null;

export function requireAuth(req, res, next) {
  const h = req.headers.authorization ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  try {
    req.userId = jwt.verify(token, SECRET).sub;
    next();
  } catch {
    res.status(401).json({ error: 'notSignedIn' });
  }
}

export const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, max: 30 });

authRouter.post('/signup', limiter, async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!isEmail(email)) return res.status(400).json({ error: 'invalidEmail' });
  if (!strong(password)) return res.status(400).json({ error: 'weakPassword' });
  if (typeof name !== 'string' || !name.trim() || name.length > 60) return res.status(400).json({ error: 'nameRequired' });
  const hash = await bcrypt.hash(password, 11);
  try {
    const { rows } = await q('insert into users (email, name, password_hash) values ($1,$2,$3) returning *', [email.trim().toLowerCase(), name.trim(), hash]);
    res.json({ token: sign(rows[0]), user: pub(rows[0]) });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'emailTaken' });
    throw e;
  }
});

authRouter.post('/login', limiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!isEmail(email) || typeof password !== 'string') return res.status(400).json({ error: 'wrongCredentials' });
  const { rows } = await q('select * from users where email=$1', [email.trim().toLowerCase()]);
  const ok = rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  if (!ok) return res.status(401).json({ error: 'wrongCredentials' });
  res.json({ token: sign(rows[0]), user: pub(rows[0]) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const { rows } = await q('select * from users where id=$1', [req.userId]);
  if (!rows[0]) return res.status(401).json({ error: 'notSignedIn' });
  res.json({ user: pub(rows[0]) });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || name.length > 60) return res.status(400).json({ error: 'nameRequired' });
  const { rows } = await q('update users set name=$2 where id=$1 returning *', [req.userId, name.trim()]);
  res.json({ user: pub(rows[0]) });
});

authRouter.post('/password', requireAuth, limiter, async (req, res) => {
  const { oldPassword, newPassword } = req.body ?? {};
  if (!strong(newPassword)) return res.status(400).json({ error: 'weakPassword' });
  const { rows } = await q('select password_hash from users where id=$1', [req.userId]);
  if (!rows[0] || !(await bcrypt.compare(oldPassword ?? '', rows[0].password_hash))) return res.status(401).json({ error: 'wrongCredentials' });
  await q('update users set password_hash=$2 where id=$1', [req.userId, await bcrypt.hash(newPassword, 11)]);
  res.json({ ok: true });
});

authRouter.post('/forgot', limiter, async (req, res) => {
  const { email, redirect } = req.body ?? {};
  if (!isEmail(email)) return res.status(400).json({ error: 'invalidEmail' });
  // Always answer the same way so the endpoint can't be used to discover accounts.
  res.json({ ok: true, emailEnabled: !!mailer });
  const { rows } = await q('select id, email from users where email=$1', [email.trim().toLowerCase()]);
  if (!rows[0] || !mailer) return;
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await q("insert into password_resets (token_hash, user_id, expires_at) values ($1,$2, now() + interval '1 hour')", [hash, rows[0].id]);
  const base = (process.env.APP_URL || (typeof redirect === 'string' ? redirect : '')).replace(/[?#].*$/, '');
  const link = `${base}?reset=${token}`;
  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER, to: rows[0].email, subject: 'Yodla — reset your password',
    text: `Open this link within 1 hour to set a new password:\n${link}\n\nIf you didn't ask for this, ignore this email.`,
  }).catch((e) => console.error('mail error', e.message));
});

authRouter.post('/reset', limiter, async (req, res) => {
  const { token, newPassword } = req.body ?? {};
  if (!strong(newPassword)) return res.status(400).json({ error: 'weakPassword' });
  const hash = crypto.createHash('sha256').update(String(token ?? '')).digest('hex');
  const { rows } = await q('update password_resets set used=true where token_hash=$1 and not used and expires_at > now() returning user_id', [hash]);
  if (!rows[0]) return res.status(400).json({ error: 'wrongCode' });
  await q('update users set password_hash=$2 where id=$1', [rows[0].user_id, await bcrypt.hash(newPassword, 11)]);
  res.json({ ok: true });
});

authRouter.delete('/me', requireAuth, async (req, res) => {
  await q('delete from users where id=$1', [req.userId]);
  res.json({ ok: true });
});
