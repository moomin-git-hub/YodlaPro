import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Minus, Plus, PlusCircle, Settings, Trash2, Clock, Folder as FolderIcon } from 'lucide-react';
import type { Deck, Folder, UserData } from '../lib/types';
import { deckTree, deleteDeck, deleteFolder } from '../lib/store';
import { deckStats } from '../lib/stats';
import { todayCount } from '../lib/queue';
import { useT } from '../lib/i18n';
import { ls, cx } from '../lib/util';
import { COLORS } from '../lib/catalog';
import { DeckCover, IconButton, confirmDialog, toast } from './ui';

const OPEN_KEY = 'yodla:openDecks';

/** Due + new-available cards for a deck and all of its subdecks. */
export function treeStats(d: UserData, id: string) {
  const ids = new Set(deckTree(id, d.decks));
  return deckStats(d.cards.filter((c) => ids.has(c.deckId)));
}

/** Noji-style deck list: expandable subdecks, "N cards to study today", hover actions. */
export function DeckTree({ data, decks, depth = 0 }: { data: UserData; decks: Deck[]; depth?: number }) {
  const [open, setOpen] = useState<string[]>(() => ls.get(OPEN_KEY, []));
  const toggle = (id: string) => { const n = open.includes(id) ? open.filter((x) => x !== id) : [...open, id]; setOpen(n); ls.set(OPEN_KEY, n); };
  return (
    <div className="space-y-2.5">
      {decks.map((deck) => <DeckNode key={deck.id} data={data} deck={deck} depth={depth} open={open} toggle={toggle} />)}
    </div>
  );
}

function DeckNode({ data, deck, depth, open, toggle }: { data: UserData; deck: Deck; depth: number; open: string[]; toggle: (id: string) => void }) {
  const { t } = useT();
  const nav = useNavigate();
  const kids = useMemo(() => data.decks.filter((x) => x.parentId === deck.id).sort((a, b) => a.title.localeCompare(b.title)), [data.decks, deck.id]);
  const st = useMemo(() => treeStats(data, deck.id), [data, deck.id]);
  const isOpen = open.includes(deck.id);
  const toStudy = useMemo(() => todayCount(data, deck.id), [data, deck.id]);
  return (
    <div className={cx('overflow-hidden rounded-[22px]', depth === 0 ? 'card-surface' : '')}>
      <div className="group relative flex cursor-pointer items-center gap-3 p-3 pr-2 transition hover:bg-ink-900/[.03] dark:hover:bg-white/[.04]" onClick={() => nav(`/deck/${deck.id}`)}>
        {kids.length > 0 ? (
          <button aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={(e) => { e.stopPropagation(); toggle(deck.id); }} className="grid h-8 w-8 shrink-0 place-items-center rounded-xl hover:bg-ink-900/5 dark:hover:bg-white/10">
            {isOpen ? <Minus size={18} /> : <Plus size={18} />}
          </button>
        ) : depth > 0 ? <span className="w-2" /> : null}
        <DeckCover cover={deck.cover} color={deck.color} image={deck.image} size={depth > 0 ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{deck.title}</p>
          <p className="flex items-center gap-1 text-xs opacity-55"><Clock size={12} />{t('toStudyToday', { n: toStudy })}{kids.length > 0 && <> · {kids.length} {t('subdecks').toLowerCase()}</>}</p>
        </div>
        <div className="hidden items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
          <IconButton label={t('addSubdeck')} onClick={() => nav(`/deck/new?parent=${deck.id}${deck.folderId ? `&folder=${deck.folderId}` : ''}`)}><PlusCircle size={19} /></IconButton>
          <IconButton label={t('editDeck')} onClick={() => nav(`/deck/${deck.id}/edit`)}><Settings size={18} /></IconButton>
          <IconButton label={t('delete')} className="text-rose-500 dark:text-rose-400" onClick={async () => {
            const sub = deckTree(deck.id, data.decks).length - 1;
            if (await confirmDialog(t('confirmDeleteDeckTree', { title: deck.title, d: sub, n: st.total }), { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteDeck(deck.id); toast(t('deleted')); }
          }}><Trash2 size={18} /></IconButton>
        </div>
        {toStudy > 0 && <span className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-extrabold text-white group-hover:hidden">{toStudy}</span>}
      </div>
      {depth === 0 && st.total > 0 && (
        <div className="mx-3 mb-2 flex h-1 overflow-hidden rounded-full bg-ink-900/[.06] dark:bg-white/10">
          <div className="bg-emerald-500" style={{ width: `${(st.mastered / st.total) * 100}%` }} />
          <div className="bg-sky-500" style={{ width: `${(st.learning / st.total) * 100}%` }} />
        </div>
      )}
      {isOpen && kids.length > 0 && (
        <div className="ml-7 border-l border-ink-900/10 pb-1 pl-2 dark:border-white/10">
          {kids.map((k) => <DeckNode key={k.id} data={data} deck={k} depth={depth + 1} open={open} toggle={toggle} />)}
        </div>
      )}
    </div>
  );
}

/** Folder row (Noji-style): coloured folder icon, settings / add deck / delete on hover. */
export function FolderRow({ data, folder, onEdit }: { data: UserData; folder: Folder; onEdit: () => void }) {
  const { t } = useT();
  const nav = useNavigate();
  const decks = data.decks.filter((d) => d.folderId === folder.id && !d.parentId);
  const due = useMemo(() => todayCount(data, `folder:${folder.id}`), [data, folder.id]);
  return (
    <div className="card-surface group flex cursor-pointer items-center gap-3 rounded-[22px] p-3 pr-2 transition hover:bg-ink-900/[.03] dark:hover:bg-white/[.04]" onClick={() => nav(`/folder/${folder.id}`)}>
      <div className={cx('grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-2xl', COLORS[folder.color ?? 'violet'] ?? COLORS.violet)}>
        {folder.emoji && folder.emoji !== '📁' ? folder.emoji : <FolderIcon size={24} className="text-white" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-extrabold">{folder.name}</p>
        <p className="text-xs opacity-55">{t('decksCount', { n: decks.length })}{due > 0 && <> · {t('toStudyToday', { n: due })}</>}</p>
      </div>
      <div className="hidden items-center gap-0.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
        <IconButton label={t('folderSettings')} onClick={onEdit}><Settings size={18} /></IconButton>
        <IconButton label={t('addDeckHere')} onClick={() => nav(`/deck/new?folder=${folder.id}`)}><PlusCircle size={19} /></IconButton>
        <IconButton label={t('delete')} className="text-rose-500 dark:text-rose-400" onClick={async () => {
          if (await confirmDialog(`${t('delete')} "${folder.name}"?`, { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteFolder(folder.id); toast(t('deleted')); }
        }}><Trash2 size={18} /></IconButton>
      </div>
      <ChevronRight className="shrink-0 opacity-30" />
    </div>
  );
}
