import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Settings as Cog, Brain, MoreVertical } from 'lucide-react';
import { AlgorithmSheet } from './DeckSettings';
import { CardMenu } from '../components/CardMenu';
import { algoFor, notesOnly, noteRows, type NoteRow } from '../lib/store';
import { ArrowLeft, Play, Plus, Pencil, Download, Sparkles, Upload, Shuffle, Bookmark, AlertTriangle, CheckSquare, Trash2, RotateCcw, FolderInput, Globe, Dumbbell, Search, X, Inbox } from 'lucide-react';
import { useData, updateCard, deleteCards, moveCards, resetProgress, updateSettings, deckTree } from '../lib/store';
import { DeckTree } from '../components/DeckTree';
import { plainText } from '../lib/rich';
import { FolderTree, CornerLeftUp, Repeat } from 'lucide-react';
import { todayCount } from '../lib/queue';
import { useT } from '../lib/i18n';
import { deckStats } from '../lib/stats';
import { isHard, isMastered, isDue, formatDuration } from '../lib/srs';
import { catKey } from '../lib/catalog';
import { csvEscape, download, cx } from '../lib/util';
import { cloudEnabled } from '../lib/api';
import { getUser } from '../lib/auth';
import { publishDeck } from '../lib/ai';
import { Button, Chip, DeckCover, Empty, IconButton, ProgressBar, Sheet, confirmDialog, toast } from '../components/ui';
import type { Card } from '../lib/types';

type Filter = 'all' | 'new' | 'learning' | 'mastered' | 'difficult' | 'bookmarked' | 'due';

export function DeckDetail() {
  const { id } = useParams();
  const d = useData();
  const { t, locale } = useT();
  const nav = useNavigate();
  const deck = d.decks.find((x) => x.id === id);
  const cards = useMemo(() => d.cards.filter((c) => c.deckId === id), [d.cards, id]);
  const treeIds = useMemo(() => deckTree(id ?? '', d.decks), [d.decks, id]);
  const allCards = useMemo(() => d.cards.filter((c) => treeIds.includes(c.deckId)), [d.cards, treeIds]);
  const st = useMemo(() => deckStats(allCards), [allCards]);
  const kids = useMemo(() => d.decks.filter((x) => x.parentId === id), [d.decks, id]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [algoOpen, setAlgoOpen] = useState(false);
  const [menuCard, setMenuCard] = useState<Card | null>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return noteRows(cards, (c) => {
      if (s && !plainText(`${c.front} ${c.back} ${c.example} ${c.explanation}`).toLowerCase().includes(s)) return false;
      switch (filter) {
        case 'new': return c.status === 'new';
        case 'learning': return c.status !== 'new' && !isMastered(c);
        case 'mastered': return isMastered(c);
        case 'difficult': return isHard(c);
        case 'bookmarked': return c.bookmarked;
        case 'due': return isDue(c);
        default: return true;
      }
    });
  }, [cards, q, filter]);

  if (!deck) return <Empty icon={<Inbox size={28} />} title={t('notFound')} action={<Button onClick={() => nav('/decks')}>{t('decks')}</Button>} />;

  const exportAs = (fmt: 'csv' | 'json') => {
    const safe = deck.title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40) || 'deck';
    if (fmt === 'csv') download(`${safe}.csv`, '﻿question,answer,example,explanation\n' + notesOnly(cards).map((c) => [plainText(c.front), plainText(c.back), c.example, c.explanation].map(csvEscape).join(',')).join('\n'), 'text/csv');
    else download(`${safe}.json`, JSON.stringify({ app: 'yodla', deck: { title: deck.title, description: deck.description, category: deck.category, cover: deck.cover, color: deck.color }, cards: notesOnly(cards).map(({ front, back, example, explanation }) => ({ front, back, example, explanation })) }, null, 2));
    setExportOpen(false);
  };
  const toggle = (r: NoteRow) => setSel((s) => { const n = new Set(s), on = n.has(r.card.id); for (const x of [r.card.id, r.rev?.id]) if (x) on ? n.delete(x) : n.add(x); return n; });
  const ids = [...(sel ?? [])];
  const toDo = useMemo(() => todayCount(d, id ?? ''), [d, id]);
  const hasDue = toDo > 0 || allCards.some((c) => c.status === 'new' && !c.frozen);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <IconButton label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>
        <div className="flex gap-1">
          <IconButton label={t('exportDeck')} onClick={() => setExportOpen(true)}><Download size={20} /></IconButton>
          <IconButton label={t('editDeck')} onClick={() => nav(`/deck/${deck.id}/edit`)}><Pencil size={20} /></IconButton>
          <IconButton label={t('settings')} onClick={() => nav(`/deck/${deck.id}/settings`)}><Cog size={20} /></IconButton>
        </div>
      </div>

      <section className="card-surface rounded-[28px] p-5">
        <div className="flex items-start gap-4">
          <DeckCover cover={deck.cover} color={deck.color} image={deck.image} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{deck.title}</h1>
            <p className="mt-0.5 text-xs font-semibold opacity-55">{t(catKey(deck.category))} · {t('created')} {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(deck.createdAt)}</p>
          </div>
        </div>
        {deck.description && <p className="mt-3 text-sm leading-relaxed opacity-70">{deck.description}</p>}
        <button onClick={() => setAlgoOpen(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1.5 text-xs font-extrabold text-brand-600 dark:text-brand-300"><Brain size={14} />{t(algoFor(deck) === 'fsrs' ? 'algoFsrs' : algoFor(deck) === 'fast' ? 'algoFast' : 'algoSm2')}</button>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[[t('newCards'), st.new, 'text-sky-500'], [t('learning'), st.learning, 'text-amber-500'], [t('mastered'), st.mastered, 'text-emerald-500'], [t('due'), st.due, 'text-brand-500']].map(([l, v, c]) => (
            <div key={l as string} className="rounded-2xl bg-ink-900/[.04] py-2.5 dark:bg-white/5"><div className={cx('text-lg font-extrabold', c as string)}>{v}</div><div className="truncate px-1 text-[11px] font-semibold opacity-55">{l}</div></div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3"><ProgressBar value={st.progress} className="flex-1" /><span className="text-sm font-extrabold">{st.progress}%</span></div>
        <div className="mt-5 flex gap-2">
          <Button size="lg" block disabled={!allCards.length} icon={<Play size={18} className="fill-white" />} onClick={() => nav(hasDue ? `/study/${deck.id}` : `/study/${deck.id}?practice=1`)}>{hasDue ? `${t('study')}${toDo > 0 ? ` · ${toDo}` : ''}` : t('practice')}</Button>
          <IconButton label={t('shuffle')} aria-pressed={d.settings.shuffle} onClick={() => { updateSettings({ shuffle: !d.settings.shuffle }); toast(`${t('shuffle')}: ${!d.settings.shuffle ? 'ON' : 'OFF'}`); }} className={cx('h-14 w-14 rounded-2xl', d.settings.shuffle ? 'bg-brand-500 text-white hover:bg-brand-600 dark:text-white' : 'card-surface')}><Shuffle size={20} /></IconButton>
          {hasDue && allCards.length > 0 && <IconButton label={t('practice')} onClick={() => nav(`/study/${deck.id}?practice=1`)} className="card-surface h-14 w-14 rounded-2xl"><Dumbbell size={20} /></IconButton>}
        </div>
      </section>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <QuickAction icon={<Plus size={18} />} label={t('addCard')} onClick={() => nav(`/card/new?deck=${deck.id}`)} />
        <QuickAction icon={<Sparkles size={18} />} label="AI" onClick={() => nav(`/create/ai?deck=${deck.id}`)} />
        <QuickAction icon={<Upload size={18} />} label={t('import')} onClick={() => nav(`/create/import?deck=${deck.id}`)} />
      </div>
      {cloudEnabled && getUser()?.mode === 'cloud' && cards.length >= 3 && (
        <Button variant="ghost" block className="mt-2" icon={<Globe size={18} />} loading={publishing} onClick={async () => {
          if (!(await confirmDialog(`${t('shareToExplore')}?`, { ok: t('shareToExplore'), cancel: t('cancel') }))) return;
          setPublishing(true);
          try { await publishDeck(deck, notesOnly(cards)); toast(t('published')); } catch (e) { toast((e as Error).message, 'err'); } finally { setPublishing(false); }
        }}>{t('shareToExplore')}</Button>
      )}

      {deck.parentId && d.decks.some((x) => x.id === deck.parentId) && (
        <button onClick={() => nav(`/deck/${deck.parentId}`)} className="mt-3 flex items-center gap-1.5 text-sm font-semibold opacity-60 hover:opacity-100">
          <CornerLeftUp size={15} />{d.decks.find((x) => x.id === deck.parentId)?.title}
        </button>
      )}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-extrabold"><FolderTree size={18} className="text-brand-500" />{t('subdecks')}{kids.length > 0 && <span className="opacity-50">· {kids.length}</span>}</h2>
          <Button size="sm" variant="soft" icon={<Plus size={16} />} onClick={() => nav(`/deck/new?parent=${deck.id}${deck.folderId ? `&folder=${deck.folderId}` : ''}`)}>{t('addSubdeck')}</Button>
        </div>
        {kids.length > 0 && <DeckTree data={d} decks={kids} />}
      </section>
      <section className="mt-6">
        <div className="relative mb-3">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
          <input className="input pl-11 pr-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchCards')} aria-label={t('searchCards')} />
          {q && <button onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-50" aria-label={t('clear')}><X size={18} /></button>}
        </div>
        <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          {(['all', 'due', 'new', 'learning', 'mastered', 'difficult', 'bookmarked'] as Filter[]).map((f) => (
            <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{t(f === 'all' ? 'all' : f === 'due' ? 'due' : f === 'new' ? 'newCards' : f === 'learning' ? 'learning' : f === 'mastered' ? 'mastered' : f === 'difficult' ? 'difficult' : 'bookmarks')}</Chip>
          ))}
        </div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold opacity-55">{sel ? t('selected', { n: shown.filter((r) => sel.has(r.card.id)).length }) : `${shown.length} ${t('cards')}`}</span>
          {cards.length > 0 && <Button size="sm" variant="ghost" icon={sel ? <X size={16} /> : <CheckSquare size={16} />} onClick={() => setSel(sel ? null : new Set())}>{sel ? t('cancel') : t('select')}</Button>}
        </div>

        {cards.length === 0 ? (
          <Empty icon={<Inbox size={28} />} title={t('emptyDeck')} sub={t('emptyDeckSub')} action={<Button icon={<Plus size={18} />} onClick={() => nav(`/card/new?deck=${deck.id}`)}>{t('addCard')}</Button>} />
        ) : shown.length === 0 ? <p className="py-10 text-center text-sm opacity-50">{t('noResults')}</p> : (
          <ul className="space-y-2">
            {shown.slice(0, 400).map((r) => <CardRow key={r.card.id} c={r.card} rev={r.rev} sel={sel} toggle={() => toggle(r)} onMenu={() => setMenuCard(r.card)} />)}
          </ul>
        )}
      </section>

      {sel && sel.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto flex max-w-md animate-pop justify-center gap-2 px-4 lg:bottom-6">
          <div className="flex gap-1 rounded-3xl bg-ink-900 p-2 text-white shadow-2xl dark:bg-white dark:text-ink-900">
            <Button size="sm" variant="ghost" className="text-inherit" icon={<FolderInput size={16} />} onClick={() => setMoveOpen(true)}>{t('move')}</Button>
            <Button size="sm" variant="ghost" className="text-inherit" icon={<RotateCcw size={16} />} onClick={async () => { if (await confirmDialog(`${t('resetProgress')} (${ids.length})?`, { ok: t('resetProgress'), cancel: t('cancel') })) { resetProgress(ids); setSel(null); toast(t('saved')); } }}>{t('resetProgress')}</Button>
            <Button size="sm" variant="danger" icon={<Trash2 size={16} />} onClick={async () => { if (await confirmDialog(t('confirmDeleteCards', { n: ids.length }), { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteCards(ids); setSel(null); toast(t('deleted')); } }}>{t('delete')}</Button>
          </div>
        </div>
      )}

      <AlgorithmSheet deck={deck} open={algoOpen} onClose={() => setAlgoOpen(false)} />
      <CardMenu card={menuCard} data={d} open={!!menuCard} onClose={() => setMenuCard(null)} onSelect={() => menuCard && setSel(new Set([menuCard.id, ...cards.filter((x) => x.cardType === 'reverse' && (x.noteId || x.id) === (menuCard.noteId || menuCard.id)).map((x) => x.id)]))} />
      <Sheet open={moveOpen} onClose={() => setMoveOpen(false)} title={t('chooseDeck')}>
        <div className="space-y-2">
          {d.decks.filter((x) => x.id !== deck.id).map((x) => (
            <button key={x.id} onClick={() => { moveCards(ids, x.id); setMoveOpen(false); setSel(null); toast(t('saved')); }} className="card-surface flex w-full items-center gap-3 rounded-2xl p-3 text-left">
              <DeckCover cover={x.cover} color={x.color} image={x.image} size="sm" /><span className="font-bold">{x.title}</span>
            </button>
          ))}
          {d.decks.length < 2 && <p className="py-4 text-center text-sm opacity-60">{t('noDecksYet')}</p>}
        </div>
      </Sheet>
      <Sheet open={exportOpen} onClose={() => setExportOpen(false)} title={t('exportDeck')}>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" size="lg" onClick={() => exportAs('csv')}>CSV</Button>
          <Button variant="secondary" size="lg" onClick={() => exportAs('json')}>JSON</Button>
        </div>
      </Sheet>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button onClick={onClick} className="card-surface flex flex-col items-center gap-1.5 rounded-3xl py-3.5 text-xs font-bold transition active:scale-95"><span className="text-brand-500 dark:text-brand-300">{icon}</span>{label}</button>;
}

function CardRow({ c, rev, sel, toggle, onMenu }: { c: Card; rev?: Card; sel: Set<string> | null; toggle: () => void; onMenu: () => void }) {
  const { t } = useT();
  const status = c.status === 'new' ? ['newCards', 'bg-sky-500'] : isMastered(c) ? ['mastered', 'bg-emerald-500'] : ['learning', 'bg-amber-500'];
  const inner = (
    <>
      {sel && <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2', sel.has(c.id) ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-900/20 dark:border-white/20')}>{sel.has(c.id) && '✓'}</span>}
      {c.image && <img src={c.image} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[15px] font-bold">{c.frozen && <span>❄</span>}<span className="truncate">{plainText(c.cardType === 'reverse' ? c.back : c.front) || (c.cardType === 'occlusion' ? t('imageOcclusion') : '🖼')}</span>{(rev || c.cardType === 'reverse') && <span title={t('alsoReversed')} aria-label={t('alsoReversed')} className="inline-flex shrink-0 items-center rounded-md bg-brand-500/12 p-1 text-brand-600 dark:text-brand-300"><Repeat size={12} strokeWidth={3} /></span>}</p>
        <p className="truncate text-sm opacity-60">{plainText(c.cardType === 'reverse' ? c.front : c.back)}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold opacity-60">
          <span className={cx('h-1.5 w-1.5 rounded-full', status[1])} />{t(status[0] as 'newCards')}
          {c.status !== 'new' && <> · {t('nextReview')}: {c.due <= Date.now() ? t('today') : formatDuration(c.due - Date.now())}</>}
        </p>
      </div>
    </>
  );
  return (
    <li className="card-surface flex items-center gap-1 rounded-2xl pr-1">
      {sel ? <button onClick={toggle} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">{inner}</button>
        : <Link to={`/card/${c.id}/edit`} className="flex min-w-0 flex-1 items-center gap-3 p-3">{inner}</Link>}
      {!sel && (
        <>
          <IconButton label={c.bookmarked ? t('removeBookmark') : t('bookmark')} onClick={() => updateCard(c.id, { bookmarked: !c.bookmarked })} className={c.bookmarked ? 'text-amber-500 dark:text-amber-400' : 'opacity-40'}><Bookmark size={18} className={c.bookmarked ? 'fill-current' : ''} /></IconButton>
          <IconButton label={c.difficult ? t('unmarkDifficult') : t('markDifficult')} onClick={() => updateCard(c.id, { difficult: !c.difficult })} className={c.difficult ? 'text-rose-500 dark:text-rose-400' : 'opacity-40'}><AlertTriangle size={18} className={c.difficult ? 'fill-current/20' : ''} /></IconButton>
          <IconButton label="Menu" onClick={onMenu} className="opacity-50"><MoreVertical size={18} /></IconButton>
        </>
      )}
    </li>
  );
}
