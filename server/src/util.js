// Small in-memory rate limiter (per IP + path). Good enough for a single Render instance.
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const key = (req.userId ?? req.ip) + req.baseUrl + req.path;
    const now = Date.now();
    const e = hits.get(key);
    if (!e || e.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return next(); }
    if (++e.n > max) return res.status(429).json({ error: 'Too many requests, try again later' });
    next();
  };
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
