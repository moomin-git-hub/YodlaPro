import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileUp } from 'lucide-react';
import { addCards, saveDeck } from '../lib/store';
import { useT } from '../lib/i18n';
import { parseDelimited, readFileText } from '../lib/util';
import { Button, IconButton, PageHeader, toast } from '../components/ui';
import { DeckPicker } from '../components/DeckPicker';
import type { DraftCard } from '../lib/types';
import { hasCloze } from '../lib/ai';

function parse(text: string): { cards: DraftCard[]; deck?: { title: string; description?: string; category?: string; cover?: string; color?: string } } {
  const s = text.trim();
  if (!s) return { cards: [] };
  if ((s.startsWith('{') && !s.startsWith('{{')) || s.startsWith('[')) {
    try {
      const j = JSON.parse(s);
      const arr = Array.isArray(j) ? j : j.cards;
      const cards = (arr ?? []).map((c: Record<string, string>) => ({ front: String(c.front ?? c.question ?? c.q ?? ''), back: String(c.back ?? c.answer ?? c.a ?? ''), example: c.example ?? '', explanation: c.explanation ?? '' })).filter((c: DraftCard) => c.front.trim() && (c.back.trim() || hasCloze(c.front)));
      return { cards, deck: j.deck };
    } catch { return { cards: [] }; }
  }
  const rows = parseDelimited(s);
  const first = rows[0]?.map((c) => c.trim().toLowerCase()) ?? [];
  const header = ['question', 'front', 'savol', 'вопрос', 'term'].includes(first[0]);
  return {
    cards: (header ? rows.slice(1) : rows)
      .map((r) => ({ front: (r[0] ?? '').replace(/<[^>]+>/g, '').trim(), back: (r[1] ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim(), example: (r[2] ?? '').trim(), explanation: (r[3] ?? '').trim() }))
      .filter((c) => c.front && (c.back || hasCloze(c.front))),
  };
}

export function ImportPage() {
  const { t } = useT();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [deckId, setDeckId] = useState(sp.get('deck') ?? '');
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parse(text), [text]);

  const doImport = () => {
    if (!parsed.cards.length) return setErr(t('parsed', { n: 0 }));
    let id = deckId;
    if (!id && parsed.deck?.title) id = saveDeck({ ...parsed.deck, title: parsed.deck.title }).id;
    if (!id) return setErr(t('selectDeck'));
    addCards(id, parsed.cards.slice(0, 5000));
    toast(`${t('import')}: ${parsed.cards.length}`);
    nav(`/deck/${id}`, { replace: true });
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('importTitle')} back={<IconButton label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>} />
      <DeckPicker value={deckId} onChange={(v) => { setDeckId(v); setErr(''); }} error={err === t('selectDeck') ? err : undefined} />
      <p className="text-sm leading-relaxed opacity-60">{t('importHelp')}</p>
      <textarea className="input min-h-[220px] font-mono text-sm" value={text} onChange={(e) => { setText(e.target.value); setErr(''); }} placeholder={'photosynthesis, process plants use to make food from light\nmitochondria; powerhouse of the cell'} aria-label={t('importPaste')} />
      <div className="flex items-center justify-between gap-3">
        <Button variant="secondary" icon={<FileUp size={18} />} onClick={() => fileRef.current?.click()}>{t('chooseFile')}</Button>
        <span className="text-sm font-bold opacity-60">{t('parsed', { n: parsed.cards.length })}</span>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.json,text/*,application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await readFileText(f)); e.target.value = ''; }} />
      </div>
      {parsed.cards.length > 0 && (
        <ul className="card-surface max-h-64 divide-y divide-ink-900/5 overflow-y-auto rounded-3xl dark:divide-white/5">
          {parsed.cards.slice(0, 50).map((c, i) => <li key={i} className="px-4 py-2.5 text-sm"><b>{c.front}</b> <span className="opacity-60">— {c.back}</span></li>)}
        </ul>
      )}
      {err && err !== t('selectDeck') && <p className="text-sm font-semibold text-rose-500">{err}</p>}
      <Button size="lg" block onClick={doImport} disabled={!parsed.cards.length}>{t('import')} {parsed.cards.length || ''}</Button>
    </div>
  );
}
