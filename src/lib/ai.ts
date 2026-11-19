import { api, cloudEnabled } from './api';
import type { DraftCard, PublicDeck } from './types';
import { PUBLIC_DECKS } from './catalog';
import { getUser } from './auth';

export type AiStatus = 'checking' | 'ready' | 'unconfigured';

/** Provider-independent: the client only knows the backend function; provider & key live in server env. */
export async function checkAi(): Promise<{ status: AiStatus; provider?: string }> {
  if (!cloudEnabled || getUser()?.mode !== 'cloud') return { status: 'unconfigured' };
  try {
    const r = await api<{ ok: boolean; provider?: string }>('/ai/status');
    return r.ok ? { status: 'ready', provider: r.provider } : { status: 'unconfigured' };
  } catch { return { status: 'unconfigured' }; }
}

/** A cloze note ({{c1::…}}) needs no separate answer. */
export const hasCloze = (s: string) => /\{\{c\d+::/.test(s);

export async function generateCards(input: { topic?: string; text?: string; count: number; language: string }): Promise<DraftCard[]> {
  const data = await api<{ cards: DraftCard[] }>('/ai/generate', { body: { ...input, text: input.text?.slice(0, 60_000) } });
  if (!Array.isArray(data?.cards)) throw new Error('Bad response');
  return data.cards
    .filter((c) => c && typeof c.front === 'string' && c.front.trim() && ((typeof c.back === 'string' && c.back.trim()) || hasCloze(c.front)))
    .map((c) => ({ front: c.front.trim(), back: (c.back ?? '').trim(), example: c.example?.trim() ?? '', explanation: c.explanation?.trim() ?? '' }));
}

export async function aiAssist(front: string, back: string, action: string, language?: string) {
  return api<{ text: string; front: string; back: string }>('/ai/assist', { body: { front, back, action, language } });
}

/** Offline, no-AI extraction of "term — definition" style lines. */
export function quickExtract(text: string, max = 100): DraftCard[] {
  const out: DraftCard[] = [];
  const seps = [/\s+[—–]\s+/, /\s+-\s+/, /\s*:\s+/, /\t/, /\s*=\s*/];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*([-*•●▪]|\d+[.)])\s*/, '').trim();
    if (line.length < 3 || line.length > 400) continue;
    for (const s of seps) {
      const m = line.split(s);
      if (m.length >= 2 && m[0].length <= 120 && m[0].trim() && m.slice(1).join(' ').trim().length > 1) {
        out.push({ front: m[0].trim(), back: m.slice(1).join(' — ').trim() });
        break;
      }
    }
    if (out.length >= max) break;
  }
  if (out.length === 0) {
    // fall back to cloze-style cards from definitional sentences: "X is Y."
    const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]/g) ?? [];
    for (const s of sentences) {
      const m = s.trim().match(/^(.{2,80}?)\s+(is|are|was|were|means|refers to|—)\s+(.{5,300})$/i);
      if (m) out.push({ front: `What ${/are|were/i.test(m[2]) ? 'are' : 'is'} ${m[1].replace(/^(the|a|an)\s+/i, '')}?`, back: m[3].replace(/[.!?]$/, '') });
      if (out.length >= max) break;
    }
  }
  return out;
}

export async function extractFileText(file: File): Promise<string> {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(doc.numPages, 80); i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      let lastY: number | null = null;
      for (const it of tc.items as { str: string; transform: number[] }[]) {
        const y = it.transform[5];
        text += (lastY !== null && Math.abs(y - lastY) > 2 ? '\n' : ' ') + it.str;
        lastY = y;
      }
      text += '\n\n';
    }
    return text.replace(/[ \t]+/g, ' ').trim();
  }
  return (await file.text()).trim();
}

/** Cloud mode: keep the original uploaded notes/PDF in the user's Neon Object Storage folder. */
export async function archiveUpload(file: File) {
  if (!cloudEnabled || getUser()?.mode !== 'cloud' || file.size > 20_000_000) return;
  const type = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : file.name.endsWith('.md') ? 'text/markdown' : 'text/plain');
  await api('/uploads', { raw: new Blob([file], { type }), headers: { 'X-File-Name': encodeURIComponent(file.name) } }).catch(() => {});
}

// ---------- public decks ----------
export async function fetchPublicDecks(): Promise<PublicDeck[]> {
  const local = PUBLIC_DECKS.map((d) => ({ ...d, cardCount: d.cards.length }));
  if (!cloudEnabled) return local;
  try {
    type Row = { id: string; title: string; description: string; category: string; cover: string; color: string; author: string; language: string; saves: number; card_count: number };
    const data = await api<Row[]>('/public-decks', { auth: false });
    const remote: PublicDeck[] = data.map((r) => ({ id: r.id, title: r.title, description: r.description ?? '', category: r.category, cover: r.cover ?? '📘', color: r.color ?? 'violet', author: r.author ?? '', language: r.language ?? '', saves: r.saves ?? 0, cardCount: r.card_count ?? 0, cards: [] }));
    return [...remote, ...local];
  } catch { return local; }
}

export async function fetchPublicCards(deck: PublicDeck): Promise<PublicDeck['cards']> {
  if (deck.cards.length || !cloudEnabled) return deck.cards;
  return api<PublicDeck['cards']>(`/public-decks/${deck.id}/cards`, { auth: false }).catch(() => []);
}

export async function publishDeck(d: { title: string; description: string; category: string; cover: string; color: string }, cards: DraftCard[]) {
  const r = await api<{ id: string }>('/public-decks', { body: { title: d.title, description: d.description, category: d.category, cover: d.cover, color: d.color, cards: cards.map(({ front, back, example, explanation }) => ({ front, back, example, explanation })) } });
  return r.id;
}
