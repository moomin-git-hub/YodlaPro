import { Router } from 'express';
import { requireAuth } from './auth.js';
import { rateLimit } from './util.js';

const PROVIDER = (process.env.AI_PROVIDER ?? '').toLowerCase();
const KEY = process.env.AI_API_KEY ?? '';
const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  openrouter: 'anthropic/claude-sonnet-4.5',
};
const MODEL = process.env.AI_MODEL || DEFAULT_MODELS[PROVIDER];


function buildPrompt(p) {
  const src = p.text ? `Create flashcards from this study material:\n"""\n${p.text}\n"""` : `Create flashcards about the topic: "${p.topic}".`;
  return `${src}

Rules:
- Produce exactly ${p.count} high-quality flashcards for active recall and spaced repetition.
- Write every field in ${p.language}.
- "front": one clear, specific question or term (max ~20 words). Avoid yes/no questions.
- "back": a concise, correct answer (max ~40 words).
- "example": a short usage example or concrete instance (may be empty).
- "explanation": one sentence of extra context that helps memory (may be empty).
- Cover the most important concepts first; no duplicates.
Return ONLY valid JSON: {"cards":[{"front":"","back":"","example":"","explanation":""}]}`;
}

async function callAI(prompt) {
  const sys = 'You are an expert teacher who writes excellent flashcards. You always reply with strict JSON only.';
  if (PROVIDER === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: sys, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message ?? `Anthropic ${r.status}`);
    return j.content?.map((c) => c.text ?? '').join('') ?? '';
  }
  if (PROVIDER === 'openai' || PROVIDER === 'openrouter') {
    const url = PROVIDER === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message ?? `${PROVIDER} ${r.status}`);
    return j.choices?.[0]?.message?.content ?? '';
  }
  if (PROVIDER === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message ?? `Gemini ${r.status}`);
    return j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  }
  throw new Error('Unsupported AI_PROVIDER');
}

function parseCards(raw) {
  const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) throw new Error('Model returned no JSON');
  const parsed = JSON.parse(m[0]);
  const arr = Array.isArray(parsed) ? parsed : parsed.cards;
  if (!Array.isArray(arr)) throw new Error('Bad JSON shape');
  return arr
    .filter((c) => c && typeof c.front === 'string' && typeof c.back === 'string')
    .map((c) => ({ front: c.front.slice(0, 500), back: c.back.slice(0, 1500), example: String(c.example ?? '').slice(0, 800), explanation: String(c.explanation ?? '').slice(0, 1000) }));
}


export const aiConfigured = () => !!(KEY && DEFAULT_MODELS[PROVIDER]);
export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.get('/status', (_req, res) => res.json({ ok: aiConfigured(), provider: aiConfigured() ? PROVIDER : null }));

aiRouter.post('/generate', rateLimit({ windowMs: 60 * 60_000, max: 40 }), async (req, res) => {
  if (!aiConfigured()) return res.status(503).json({ error: 'AI provider is not configured on the server' });
  const b = req.body ?? {};
  const count = Math.max(1, Math.min(50, Number(b.count) || 10));
  const topic = typeof b.topic === 'string' ? b.topic.trim().slice(0, 200) : '';
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 60_000) : '';
  const language = typeof b.language === 'string' ? b.language.slice(0, 40) : 'English';
  if (!topic && text.length < 20) return res.status(400).json({ error: 'Provide a topic or at least 20 characters of text' });
  try {
    const cards = parseCards(await callAI(buildPrompt({ topic, text, count, language }))).slice(0, count);
    res.json({ cards });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
