import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Globe, Sparkles, WifiOff, Upload, Pencil, CornerUpRight, Copy, RotateCcw, Archive, Download, Trash2, ChevronRight, Brain, SlidersHorizontal, Check } from 'lucide-react';
import { useData, saveDeck, duplicateDeck, resetProgress, deleteDeck, deckTree, descendants, algoFor, presetFor } from '../lib/store';
import { useT } from '../lib/i18n';
import { ALGORITHMS, PRESET_IDS, type Algorithm, type PresetId } from '../lib/srs';
import { plainText } from '../lib/rich';
import { csvEscape, download, cx } from '../lib/util';
import { cloudEnabled } from '../lib/api';
import { getUser } from '../lib/auth';
import { publishDeck } from '../lib/ai';
import { Button, DeckCover, Empty, IconButton, Sheet, Toggle, confirmDialog, toast } from '../components/ui';
import type { Deck } from '../lib/types';

const algoKey = (a: Algorithm) => (a === 'fsrs' ? 'algoFsrs' : a === 'fast' ? 'algoFast' : 'algoSm2') as 'algoFsrs';
const presetKey = (p: PresetId) => ('preset' + p[0].toUpperCase() + p.slice(1)) as 'presetStandard';

/** Choose learning algorithm — FSRS (recommended), Fast review (no schedule), General spaced repetition (SM-2). */
export function AlgorithmSheet({ deck, open, onClose }: { deck: Deck; open: boolean; onClose: () => void }) {
  const { t } = useT();
  const cur = algoFor(deck);
  return (
    <Sheet open={open} onClose={onClose} title={t('chooseAlgorithm')}>
      <div className="space-y-3">
        {ALGORITHMS.map((a) => (
          <button key={a} onClick={() => { saveDeck({ ...deck, algorithm: a }); toast(t('saved')); onClose(); }}
            className={cx('flex w-full items-start gap-3 rounded-[22px] border-2 p-4 text-left transition', cur === a ? 'border-brand-500 bg-brand-500/5' : 'border-transparent bg-ink-900/[.04] hover:bg-ink-900/[.07] dark:bg-white/5')}>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[16px] font-extrabold">{t(algoKey(a))}
                {a === 'fsrs' && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">{t('recommended_')}</span>}
              </p>
              <p className="mt-1 text-sm leading-relaxed opacity-65">{t((algoKey(a) + 'Desc') as 'algoFsrsDesc')}</p>
            </div>
            {cur === a && <Check className="mt-1 shrink-0 text-brand-500" size={20} />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function DeckSettings() {
  const { id } = useParams();
  const d = useData();
  const { t } = useT();
  const nav = useNavigate();
  const deck = d.decks.find((x) => x.id === id);
  const [sheet, setSheet] = useState<null | 'algo' | 'preset' | 'move' | 'rename' | 'export'>(null);
  const [name, setName] = useState(deck?.title ?? '');
  const [publishing, setPublishing] = useState(false);
  if (!deck) return <Empty icon={null} title={t('notFound')} action={<Button onClick={() => nav('/decks')}>{t('decks')}</Button>} />;
  const cards = d.cards.filter((c) => c.deckId === deck.id);
  const treeIds = deckTree(deck.id, d.decks);
  const cfg = presetFor(deck);
  const pid = (deck.preset ?? d.settings.defaultPreset ?? 'standard') as PresetId;
  const blocked = new Set(treeIds);

  const exportAs = (fmt: 'csv' | 'json') => {
    const safe = deck.title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40) || 'deck';
    const seen = new Set<string>();
    const expCards = cards.filter((c) => {
      if (c.cardType === 'occlusion' || c.cardType === 'reverse') return false;
      const k = c.noteId ?? c.id;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    if (fmt === 'csv') download(`${safe}.csv`, '﻿question,answer,example,explanation\n' + expCards.map((c) => [plainText(c.front), plainText(c.back), c.example, c.explanation].map(csvEscape).join(',')).join('\n'), 'text/csv');
    else download(`${safe}.json`, JSON.stringify({ app: 'yodla', deck: { title: deck.title, description: deck.description, category: deck.category, cover: deck.cover, color: deck.color, algorithm: algoFor(deck) }, cards: expCards.map(({ front, back, example, explanation, cardType, extra, noteId }) => ({ front, back, example, explanation, cardType, extra, noteId })) }, null, 2));
    setSheet(null); toast(t('exported'));
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center gap-2">
        <IconButton label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>
        <h1 className="flex-1 truncate text-xl font-extrabold">{t('settings')} · {deck.title}</h1>
      </div>

      <Group>
        <Row icon={<Brain size={20} />} label={t('learningAlgorithm')} value={t(algoKey(algoFor(deck)))} onClick={() => setSheet('algo')} />
        {algoFor(deck) !== 'fast' && <Row icon={<SlidersHorizontal size={20} />} label={t('preset')} value={t(presetKey(pid))}
          sub={t('presetSummary2', { a: cfg.learningSteps.map(fmtMin).join(' · '), n: cfg.newPerDay, r: Math.round(cfg.desiredRetention * 100) })} onClick={() => setSheet('preset')} />}
      </Group>

      <Group>
        <Row icon={<Globe size={20} />} label={t('shareToExplore')} disabled={!cloudEnabled || !getUser() || cards.length < 3 || publishing} onClick={async () => {
          setPublishing(true);
          try { await publishDeck(deck, cards); toast(t('published')); } catch (e) { toast((e as Error).message, 'err'); } finally { setPublishing(false); }
        }} />
        <Row icon={<Sparkles size={20} />} label={t('aiGenerate')} onClick={() => nav(`/create/ai?deck=${deck.id}`)} />
        <div className="flex items-center gap-4 px-5 py-4">
          <WifiOff size={20} className="shrink-0 opacity-70" />
          <div className="min-w-0 flex-1"><p className="text-[16px] font-bold">{t('offlineLearning')}</p><p className="text-xs opacity-55">{t('offlineDesc')}</p></div>
          <Toggle label={t('offlineLearning')} checked={!!deck.offline} onChange={async (v) => {
            saveDeck({ ...deck, offline: v });
            if (v) { // warm the browser cache with this deck's images
              const urls = [...new Set(cards.flatMap((c) => [c.image, ...((c.front + c.back).match(/src="([^"]+)"/g) ?? []).map((m) => m.slice(5, -1))]).filter(Boolean))];
              await Promise.allSettled(urls.map((u) => fetch(u, { cache: 'force-cache' })));
            }
            toast(t('saved'));
          }} />
        </div>
        <Row icon={<Upload size={20} />} label={t('importCards')} onClick={() => nav(`/create/import?deck=${deck.id}`)} />
      </Group>

      <Group>
        <Row icon={<Pencil size={20} />} label={t('renameDeck')} onClick={() => { setName(deck.title); setSheet('rename'); }} />
        <Row icon={<CornerUpRight size={20} />} label={t('moveDeck')} onClick={() => setSheet('move')} />
        <Row icon={<Copy size={20} />} label={t('duplicateDeck')} onClick={() => { const c = duplicateDeck(deck.id); if (c) { toast(t('saved')); nav(`/deck/${c.id}`, { replace: true }); } }} />
        <Row icon={<RotateCcw size={20} />} label={t('resetProgress')} onClick={async () => {
          const ids = d.cards.filter((c) => treeIds.includes(c.deckId)).map((c) => c.id);
          if (await confirmDialog(t('resetDeckConfirm', { n: ids.length }), { ok: t('resetProgress'), cancel: t('cancel') })) { resetProgress(ids); toast(t('saved')); }
        }} />
        <Row icon={<Archive size={20} />} label={t(deck.archived ? 'unarchive' : 'archiveDeck')} onClick={() => { saveDeck({ ...deck, archived: !deck.archived }); toast(t('saved')); if (!deck.archived) nav('/decks'); }} />
        <Row icon={<Download size={20} />} label={t('exportDeck')} onClick={() => setSheet('export')} />
        <Row icon={<Trash2 size={20} />} danger label={t('deleteDeck')} onClick={async () => {
          const sub = descendants(deck.id, d.decks).length, n = d.cards.filter((c) => treeIds.includes(c.deckId)).length;
          const msg = sub ? t('confirmDeleteDeckTree', { title: deck.title, d: sub, n }) : t('confirmDeleteDeck', { title: deck.title });
          if (await confirmDialog(msg, { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteDeck(deck.id); toast(t('deleted')); nav('/decks', { replace: true }); }
        }} />
      </Group>

      <AlgorithmSheet deck={deck} open={sheet === 'algo'} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'preset'} onClose={() => setSheet(null)} title={t('preset')}>
        <div className="space-y-2">
          {PRESET_IDS.map((p) => (
            <button key={p} onClick={() => { saveDeck({ ...deck, preset: p }); setSheet(null); toast(t('saved')); }} className={cx('flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-left', pid === p ? 'border-brand-500 bg-brand-500/5' : 'border-transparent bg-ink-900/[.04] dark:bg-white/5')}>
              <span className="flex-1 font-bold">{t(presetKey(p))}</span>{pid === p && <Check size={18} className="text-brand-500" />}
            </button>
          ))}
          <p className="pt-1 text-xs opacity-55">{t('presetCustom')}: {t('profile')} → {t('preset')}</p>
        </div>
      </Sheet>
      <Sheet open={sheet === 'rename'} onClose={() => setSheet(null)} title={t('renameDeck')}>
        <input className="input" autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && (saveDeck({ ...deck, title: name.trim() }), setSheet(null))} />
        <Button block size="lg" className="mt-4" disabled={!name.trim()} onClick={() => { saveDeck({ ...deck, title: name.trim() }); setSheet(null); toast(t('saved')); }}>{t('save')}</Button>
      </Sheet>
      <Sheet open={sheet === 'move'} onClose={() => setSheet(null)} title={t('moveTo')}>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          <MoveRow label={t('home2')} active={!deck.parentId && !deck.folderId} onClick={() => { saveDeck({ ...deck, parentId: null, folderId: null }); setSheet(null); toast(t('saved')); }} />
          {d.folders.map((f) => <MoveRow key={f.id} label={`${f.emoji ?? '📁'} ${f.name}`} active={!deck.parentId && deck.folderId === f.id} onClick={() => { saveDeck({ ...deck, parentId: null, folderId: f.id }); setSheet(null); toast(t('saved')); }} />)}
          {d.decks.filter((x) => !blocked.has(x.id) && !x.archived).map((x) => (
            <MoveRow key={x.id} label={x.title} cover={x} active={deck.parentId === x.id} onClick={() => { saveDeck({ ...deck, parentId: x.id, folderId: x.folderId }); setSheet(null); toast(t('saved')); }} />
          ))}
        </div>
      </Sheet>
      <Sheet open={sheet === 'export'} onClose={() => setSheet(null)} title={t('exportDeck')}>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => exportAs('csv')}>CSV</Button>
          <Button variant="secondary" size="lg" onClick={() => exportAs('json')}>JSON</Button>
        </div>
      </Sheet>
    </div>
  );
}

export const fmtMin = (m: number) => (m >= 1440 ? `${Math.round(m / 1440)}d` : m >= 60 ? `${Math.round(m / 60)}h` : `${m}m`);

function Group({ children }: { children: ReactNode }) {
  return <div className="card-surface mb-4 divide-y divide-ink-900/5 overflow-hidden rounded-[24px] dark:divide-white/5">{children}</div>;
}
function Row({ icon, label, value, sub, onClick, danger, disabled }: { icon: ReactNode; label: string; value?: string; sub?: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className={cx('flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-ink-900/[.03] disabled:opacity-40 dark:hover:bg-white/5', danger && 'text-rose-500')}>
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[16px] font-bold">{label}</span>{sub && <span className="block truncate text-xs opacity-55">{sub}</span>}</span>
      {value && <span className="max-w-[45%] truncate text-right text-sm font-semibold opacity-55">{value}</span>}
      {!danger && <ChevronRight size={18} className="opacity-30" />}
    </button>
  );
}
function MoveRow({ label, onClick, active, cover }: { label: string; onClick: () => void; active?: boolean; cover?: Deck }) {
  return (
    <button onClick={onClick} className={cx('card-surface flex w-full items-center gap-3 rounded-2xl p-3 text-left', active && 'ring-2 ring-brand-500')}>
      {cover && <DeckCover cover={cover.cover} color={cover.color} image={cover.image} size="sm" />}<span className="flex-1 font-bold">{label}</span>{active && <Check size={18} className="text-brand-500" />}
    </button>
  );
}
