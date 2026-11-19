import './tz.js';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate, pool } from './db.js';
import { authRouter } from './auth.js';
import { syncRouter } from './sync.js';
import { filesRouter, fileServe } from './files.js';
import { aiRouter, aiConfigured } from './ai.js';
import { publicRouter } from './public.js';
import { storageEnabled } from './storage.js';
import { telegramRouter, miniAppAuth, setupTelegram, telegramEnabled } from './telegram.js';
import { buildReport } from './reports.js';
import { requireAuth } from './auth.js';
import { wrap } from './util.js';
import { mcpRouter, claudeRouter, connectRouter } from './mcp.js';

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.disable('x-powered-by');
app.use(compression());

const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
app.use('/api', cors({ origin: origins.length ? origins : true, allowedHeaders: ['Content-Type', 'Authorization', 'X-File-Name'], maxAge: 86400 }));
app.use((_req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' }); next(); });

// File uploads read the raw body themselves, so mount them before the JSON parser.
app.use('/api', filesRouter);
app.use('/api', fileServe);
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', async (_req, res) => {
  await pool.query('select 1');
  res.json({ ok: true, storage: storageEnabled, ai: aiConfigured(), telegram: telegramEnabled });
});
app.post('/api/auth/telegram', miniAppAuth); // Telegram Mini App sign-in
app.use('/api/auth', authRouter);
app.use('/api/telegram', telegramRouter);
// study reports: /api/reports/pdf|xlsx|docx?period=week|month
app.get('/api/reports/:fmt', requireAuth, wrap(async (req, res) => {
  const r = await buildReport(req.userId, req.params.fmt, req.query.period === 'month' ? 'month' : 'week');
  res.set({ 'Content-Type': r.mime, 'Content-Disposition': `attachment; filename="${r.name}"`, 'Cache-Control': 'no-store' }).send(r.buffer);
}));
app.use('/api/connect', cors({ origin: true }), connectRouter); // same tools as plain REST + OpenAPI (ChatGPT Actions)
app.use('/api/claude', claudeRouter); // personal Claude connector link
app.use('/api/sync', syncRouter);
app.use('/api/ai', aiRouter);
app.use('/api/public-decks', publicRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
// Claude connector (remote MCP server, Streamable HTTP): https://<host>/mcp/<personal token>
app.use('/mcp', cors({ origin: true, allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Last-Event-ID'], exposedHeaders: ['Mcp-Session-Id'] }), mcpRouter);

// Serve the built frontend (one Render web service for app + API).
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (/assets[\\/]/.test(p)) res.set('Cache-Control', 'public, max-age=31536000, immutable'); } }));
  app.get(/^(?!\/api|\/mcp).*/, (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
});

const port = Number(process.env.PORT ?? 3000);
await migrate();
app.listen(port, () => console.log(`Yodla server on :${port} · storage=${storageEnabled} · ai=${aiConfigured()} · telegram=${telegramEnabled}`));
setupTelegram();
