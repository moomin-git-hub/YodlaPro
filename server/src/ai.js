import { Router } from 'express';
import { requireAuth } from './auth.js';
import { rateLimit } from './util.js';

const PROVIDER = (process.env.AI_PROVIDER ?? '').toLowerCase();
const KEY = process.env.AI_API_KEY ?? '';
const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-flash-latest', // alias that always points at Google's current Flash model
  openrouter: 'anthropic/claude-sonnet-4.5',
};
let MODEL = process.env.AI_MODEL || DEFAULT_MODELS[PROVIDER];

// Models get retired. When the provider says a model is gone, find a working replacement once and remember it.
const RETIRED = /no longer available|not found|is not supported|deprecated|does not exist|model_not_found|unknown model/i;
async function geminiReplacement(message) {
  const hinted = message.match(/use (?:models\/)?([\w.-]+)/i)?.[1];
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${KEY}`);
    const j = await r.json();
    const ok = (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
    if (hinted && ok.includes(hinted)) return hinted;
    const score = (n) => {
      const v = n.match(/gemini-(\d+(?:\.\d+)?)/);
      return (v ? parseFloat(v[1]) * 100 : 0) + (/flash/.test(n) ? 10 : 0) - (/lite|preview|exp|thinking|tts|image|live|embedding|audio/.test(n) ? 50 : 0);
    };
    const best = ok.filter((n) => n.startsWith('gemini')).sort((a, b) => score(b) - score(a))[0];
    return best ?? hinted ?? 'gemini-flash-latest';
  } catch {
    return hinted ?? 'gemini-flash-latest';
  }
}


function buildPrompt(p) {
  const src = p.text ? `Create flashcards from this study material:\n"""\n${p.text}\n"""` : `Create flashcards about the topic: "${p.topic}".`;
  const detail = { brief: 'Keep answers very short (a few words).', detailed: 'Give thorough answers (up to ~60 words) with context.' }[p.detail] ?? 'Keep answers concise (max ~40 words).';
  const format = {
    cloze: 'Every card must be fill-in-the-blank: put the full sentence in "front" and mark the hidden part as {{c1::hidden words}} (use c2, c3 for more blanks in the same sentence); "back" may be empty or a short note.',
    both: 'Mix formats: about half question/answer cards and half fill-in-the-blank cards where "front" is a sentence with {{c1::hidden words}}.',
  }[p.format] ?? '"front": one clear, specific question or term (max ~20 words). Avoid yes/no questions. "back": the correct answer.';
  return `${src}

Rules:
- Produce exactly ${p.count} high-quality flashcards for active recall and spaced repetition.
- Write every field in ${p.language}.
- ${format}
- ${detail}
- "example": a short usage example or concrete instance (may be empty).
- "explanation": one sentence of extra context that helps memory (may be empty).
- Cover the most important concepts first; no duplicates.${p.instructions ? `\n- Extra instructions from the learner: ${p.instructions}` : ''}
Return ONLY valid JSON: {"cards":[{"front":"","back":"","example":"","explanation":""}]}`;
}

const SYS = 'You are an expert teacher who writes excellent flashcards. You always reply with strict JSON only.';
/** Overload / rate limit / server hiccup: worth retrying (e.g. Gemini 503 "high demand"). */
const TRANSIENT = /high demand|overloaded|unavailable|resource.?exhausted|rate.?limit|try again later|timeout|temporar/i;
const isTransient = (e) => [429, 500, 502, 503, 504, 529].includes(e.status) || TRANSIENT.test(e.message ?? '');
// lighter models to fall back to when the main one is overloaded
const FALLBACKS = { gemini: ['gemini-flash-latest', 'gemini-flash-lite-latest'], anthropic: ['claude-haiku-4-5'], openai: ['gpt-4o-mini'], openrouter: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls the AI with retries (1s, 2s, 4s backoff) and, if the model stays busy, falls back to a lighter model.
 * When everything is busy the error has code "aiBusy" so apps can show a friendly, translated message.
 */
async function callAI(prompt, sys = SYS, media = null) {
  const models = [MODEL, ...(process.env.AI_FALLBACK_MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ?? FALLBACKS[PROVIDER] ?? [])]
    .filter((m, i, a) => m && a.indexOf(m) === i);
  let last;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await callModel(prompt, sys, model, media);
      } catch (e) {
        last = e;
        if (PROVIDER === 'gemini' && model === MODEL && RETIRED.test(e.message)) {
          const next = await geminiReplacement(e.message);
          if (next !== MODEL) { console.warn(`AI model ${MODEL} unavailable, switching to ${next}`); MODEL = next; return callAI(prompt, sys, media); }
        }
        if (!isTransient(e)) break; // a real error (bad key, bad request…): no point retrying this model
        console.warn(`AI ${model} busy (${e.status ?? ''} ${e.message?.slice(0, 80)}), retry ${attempt + 1}`);
        if (attempt < 2) await sleep(1000 * 2 ** attempt);
      }
    }
    if (last && !isTransient(last)) throw last;
  }
  const busy = new Error('aiBusy'); busy.code = 'aiBusy'; busy.cause = last;
  throw busy;
}

const fail = (msg, status) => Object.assign(new Error(msg), { status });

/** media: optional { mime, data (base64) } — a photo (all providers) or audio (Gemini) to read flashcards from. */
async function callModel(prompt, sys, MODEL, media = null) {
  if (media && !media.mime.startsWith('image/') && PROVIDER !== 'gemini') throw fail('mediaUnsupported', 400);
  if (PROVIDER === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 8000, system: sys, messages: [{ role: 'user', content: media ? [{ type: 'image', source: { type: 'base64', media_type: media.mime, data: media.data } }, { type: 'text', text: prompt }] : prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) throw fail(j?.error?.message ?? `Anthropic ${r.status}`, r.status);
    return j.content?.map((c) => c.text ?? '').join('') ?? '';
  }
  if (PROVIDER === 'openai' || PROVIDER === 'openrouter') {
    const url = PROVIDER === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: media ? [{ type: 'image_url', image_url: { url: `data:${media.mime};base64,${media.data}` } }, { type: 'text', text: prompt }] : prompt }] }),
    });
    const j = await r.json();
    if (!r.ok) throw fail(j?.error?.message ?? `${PROVIDER} ${r.status}`, r.status);
    return j.choices?.[0]?.message?.content ?? '';
  }
  if (PROVIDER === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents: [{ role: 'user', parts: [...(media ? [{ inline_data: { mime_type: media.mime, data: media.data } }] : []), { text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(j?.error?.message ?? `Gemini ${r.status}`, r.status);
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
    .filter((c) => c && typeof c.front === 'string' && (typeof c.back === 'string' || /\{\{c\d+::/.test(c.front)))
    .map((c) => ({ front: c.front.slice(0, 500), back: String(c.back ?? '').slice(0, 1500), example: String(c.example ?? '').slice(0, 800), explanation: String(c.explanation ?? '').slice(0, 1000) }));
}


export const aiConfigured = () => !!(KEY && DEFAULT_MODELS[PROVIDER]);
export const aiRouter = Router();
aiRouter.use(requireAuth);

aiRouter.get('/status', (_req, res) => res.json({ ok: aiConfigured(), provider: aiConfigured() ? PROVIDER : null }));

// Toolbar "✨" in the card editor: write the answer / an example / an explanation for one card.
aiRouter.post('/assist', rateLimit({ windowMs: 60 * 60_000, max: 120 }), async (req, res) => {
  if (!aiConfigured()) return res.status(503).json({ error: 'AI provider is not configured on the server' });
  const b = req.body ?? {};
  const strip = (v) => (typeof v === 'string' ? v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000) : '');
  const front = strip(b.front), back = strip(b.back);
  const action = ['answer', 'example', 'explanation', 'improve', 'question'].includes(b.action) ? b.action : 'answer';
  const language = typeof b.language === 'string' && b.language ? b.language.slice(0, 40) : 'the same language as the card';
  if (!front && !back) return res.status(400).json({ error: 'Write something on the card first' });
  const task = {
    answer: 'Write the best concise answer (back side) for this question/term.',
    question: 'Write a clear question (front side) whose answer is the given back side.',
    example: 'Write one short, natural example sentence or concrete instance that illustrates it.',
    explanation: 'Write one or two sentences of explanation that make it easier to remember.',
    improve: 'Rewrite the front and back to be clearer and more precise, keeping the meaning.',
  }[action];
  const prompt = `Flashcard\nFront: ${front || '(empty)'}\nBack: ${back || '(empty)'}\n\nTask: ${task}\nAnswer in ${language}. Plain text, no markdown.\nReturn ONLY JSON: {"front":"","back":"","text":""} — put your result in "text" (and for "improve" fill "front" and "back").`;
  try {
    const raw = await callAI(prompt, 'You are an expert teacher helping write flashcards. You always reply with strict JSON only.');
    const m = raw.match(/\{[\s\S]*\}/);
    const j = m ? JSON.parse(m[0]) : { text: raw.trim() };
    res.json({ text: String(j.text ?? '').trim(), front: String(j.front ?? '').trim(), back: String(j.back ?? '').trim() });
  } catch (e) {
    res.status(e.code === 'aiBusy' ? 503 : 502).json({ error: e.code === 'aiBusy' ? 'aiBusy' : e.message });
  }
});

aiRouter.post('/generate', rateLimit({ windowMs: 60 * 60_000, max: 40 }), async (req, res) => {
  if (!aiConfigured()) return res.status(503).json({ error: 'AI provider is not configured on the server' });
  const b = req.body ?? {};
  const count = Math.max(1, Math.min(50, Number(b.count) || 10));
  const topic = typeof b.topic === 'string' ? b.topic.trim().slice(0, 200) : '';
  const text = typeof b.text === 'string' ? b.text.trim().slice(0, 60_000) : '';
  const language = typeof b.language === 'string' ? b.language.slice(0, 40) : 'English';
  const format = ['qa', 'cloze', 'both'].includes(b.format) ? b.format : 'qa';
  const detail = ['brief', 'normal', 'detailed'].includes(b.detail) ? b.detail : 'normal';
  const instructions = typeof b.instructions === 'string' ? b.instructions.trim().slice(0, 800) : '';
  if (!topic && text.length < 20) return res.status(400).json({ error: 'Provide a topic or at least 20 characters of text' });
  try {
    const cards = parseCards(await callAI(buildPrompt({ topic, text, count, language, format, detail, instructions }))).slice(0, count);
    res.json({ cards });
  } catch (e) {
    res.status(e.code === 'aiBusy' ? 503 : 502).json({ error: e.code === 'aiBusy' ? 'aiBusy' : e.message });
  }
});
export { callAI as _callAI }; // for tests
export { callAI, buildPrompt, parseCards };
