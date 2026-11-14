import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Pencil, Pause, Play, CornerUpRight, Repeat, Copy, History, Trash2 } from 'lucide-react';
import type { Card, UserData } from '../lib/types';
import { updateCard, moveCards, deleteCards, noteOf, hasReverse, saveBasicNote, duplicateNote, getData } from '../lib/store';
import { formatDuration, isMastered, recallProbability, DAY } from '../lib/srs';
import { useT } from '../lib/i18n';
import { cx } from '../lib/util';
import { DeckCover, Sheet, confirmDialog, toast } from './ui';

/**
 * Noji-style card menu: Select · Edit · Freeze · Move · Reverse/Unreverse · Duplicate · Learning history · Delete.
 * onGone() is called when the card left the current context (frozen, moved, deleted).
 */
export function CardMenu({ card, data, open, onClose, onSelect, onGone, onEdit }: {
  card: Card | null; data: UserData; open: boolean; onClose: () => void; onSelect?: () => void; onGone?: () => void; onEdit?: () => void;
}) {
  const { t } = useT();
  const nav = useNavigate();
  const [page, setPage] = useState<'menu' | 'move' | 'history'>('menu');
  if (!card) return null;
  const close = () => { setPage('menu'); onClose(); };
  const reversed = hasReverse(card);
  const canReverse = !card.cardType || card.cardType === 'basic' || card.cardType === 'reverse';

  return (
    <Sheet open={open} onClose={close} title={page === 'move' ? t('chooseDeck') : page === 'history' ? t('cardHistory') : undefined}>
      {page === 'menu' && (
        <div className="space-y-2">
          {onSelect && <Item icon={<CheckCircle2 size={20} />} label={t('select')} onClick={() => { close(); onSelect(); }} />}
          <Item icon={<Pencil size={20} />} label={t('edit')} onClick={() => { close(); onEdit?.(); nav(`/card/${card.id}/edit`); }} />
          <Item icon={card.frozen ? <Play size={20} /> : <Pause size={20} />} label={t(card.frozen ? 'unfreeze' : 'freeze')} onClick={() => {
            updateCard(card.id, { frozen: !card.frozen }); toast(t('saved')); close(); if (!card.frozen) onGone?.();
          }} />
          <Item icon={<CornerUpRight size={20} />} label={t('move')} onClick={() => setPage('move')} />
          {canReverse && <Item icon={<Repeat size={20} />} label={t(reversed ? 'unreverse' : 'reverse')} onClick={() => {
            const base = noteOf(card).find((c) => c.cardType !== 'reverse') ?? card;
            saveBasicNote(base, {}, !reversed); toast(t('saved')); close();
            if (reversed && card.cardType === 'reverse') onGone?.();
          }} />}
          <Item icon={<Copy size={20} />} label={t('duplicate')} onClick={() => { duplicateNote(card); toast(t('saved')); close(); }} />
          <Item icon={<History size={20} />} label={t('cardHistory')} onClick={() => setPage('history')} />
          <Item icon={<Trash2 size={20} />} label={t('delete')} danger onClick={async () => {
            const ids = noteOf(card).map((c) => c.id);
            if (await confirmDialog(t('confirmDeleteCards', { n: ids.length }), { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteCards(ids); toast(t('deleted')); close(); onGone?.(); }
          }} />
        </div>
      )}
      {page === 'move' && (
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {data.decks.filter((d) => d.id !== card.deckId).map((d) => (
            <button key={d.id} onClick={() => { moveCards(noteOf(card).map((c) => c.id), d.id); toast(t('saved')); close(); onGone?.(); }} className="card-surface flex w-full items-center gap-3 rounded-2xl p-3 text-left">
              <DeckCover cover={d.cover} color={d.color} image={d.image} size="sm" /><span className="font-bold">{d.title}</span>
            </button>
          ))}
        </div>
      )}
      {page === 'history' && <HistoryView card={getData().cards.find((c) => c.id === card.id) ?? card} data={data} />}
    </Sheet>
  );
}

function Item({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cx('flex w-full items-center gap-4 rounded-[20px] bg-ink-900/[.04] px-5 py-4 text-left text-[16px] font-bold transition hover:bg-ink-900/[.08] dark:bg-white/[.05] dark:hover:bg-white/10', danger && 'text-rose-500')}>
      {icon}{label}
    </button>
  );
}

export function HistoryView({ card, data }: { card: Card; data: UserData }) {
  const { t, locale } = useT();
  const logs = data.reviews.filter((r) => r.cardId === card.id).sort((a, b) => b.ts - a.ts);
  const r = recallProbability(card);
  const tiles: [string, string][] = [
    [t('status'), t(card.frozen ? 'frozen' : card.status === 'new' ? 'newCards' : isMastered(card) ? 'mastered' : 'learning')],
    [t('nextReview'), card.status === 'new' ? '—' : card.due <= Date.now() ? t('today') : formatDuration(card.due - Date.now())],
    card.stability ? [t('stability'), formatDuration(card.stability * DAY)] : [t('ease'), card.ease.toFixed(2)],
    r != null ? [t('recall'), `${Math.round(r * 100)}%`] : [t('lapses'), String(card.lapses)],
  ];
  const tone = ['bg-rose-500/15 text-rose-600', 'bg-amber-500/15 text-amber-600', 'bg-emerald-500/15 text-emerald-600', 'bg-sky-500/15 text-sky-600'];
  return (
    <div>
      <div className="mb-4 grid grid-cols-4 gap-2 text-center">
        {tiles.map(([l, v]) => <div key={l} className="rounded-2xl bg-ink-900/[.04] p-2 dark:bg-white/5"><div className="truncate text-sm font-extrabold">{v}</div><div className="truncate text-[11px] opacity-55">{l}</div></div>)}
      </div>
      {!logs.length && <p className="py-6 text-center text-sm opacity-50">{t('noHistory')}</p>}
      <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
        {logs.map((l) => (
          <li key={l.id} className="flex items-center gap-3 text-sm">
            <span className={cx('w-20 rounded-lg px-2 py-0.5 text-center text-xs font-bold', tone[l.rating - 1])}>{t((['again', 'hard', 'good', 'easy'] as const)[l.rating - 1])}</span>
            <span className="flex-1 opacity-70">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(l.ts)}</span>
            <span className="opacity-55">→ {l.newInterval > 0 ? formatDuration(l.newInterval * DAY) : '<1d'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
