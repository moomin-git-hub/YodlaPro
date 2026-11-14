import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, FolderPlus, Search, AlertTriangle, Bookmark, Layers, ArrowLeft, Settings, Trash2, Play } from 'lucide-react';
import { useData, saveFolder, deleteFolder, deckTree } from '../lib/store';
import { todayCount } from '../lib/queue';
import { useT } from '../lib/i18n';
import { isHard } from '../lib/srs';
import { COLORS } from '../lib/catalog';
import { cx } from '../lib/util';
import type { Folder } from '../lib/types';
import { DeckTree, FolderRow } from '../components/DeckTree';
import { Button, Empty, IconButton, PageHeader, Sheet, Field, confirmDialog, toast } from '../components/ui';

const FOLDER_EMOJI = ['📁', '📚', '🗣️', '🎓', '🧪', '💼', '🏨', '🩺', '💻', '🌍', '⭐', '🔥', '🇬🇧', '🇷🇺', '🇸🇦', '📖'];

export function Decks() {
  const d = useData();
  const { t } = useT();
  const nav = useNavigate();
  const [edit, setEdit] = useState<Partial<Folder> | null>(null);
  const [showArch, setShowArch] = useState(false);
  const archived = d.decks.filter((x) => x.archived);
  const roots = useMemo(() => d.decks.filter((x) => !x.parentId && !x.folderId && !x.archived).sort((a, b) => b.updatedAt - a.updatedAt), [d.decks]);
  const folders = useMemo(() => [...d.folders].sort((a, b) => a.createdAt - b.createdAt), [d.folders]);
  const hard = d.cards.filter(isHard).length;
  const marks = d.cards.filter((c) => c.bookmarked).length;

  return (
    <div>
      <PageHeader title={t('decks')} sub={`${d.decks.length} · ${d.cards.length} ${t('cards')}`} right={
        <div className="flex gap-1">
          <IconButton label={t('search')} onClick={() => nav('/search')}><Search size={20} /></IconButton>
          <IconButton label={t('newFolder')} onClick={() => setEdit({})}><FolderPlus size={20} /></IconButton>
          <IconButton label={t('createDeck')} onClick={() => nav('/deck/new')} className="bg-brand-500 text-white hover:bg-brand-600 dark:text-white"><Plus size={20} /></IconButton>
        </div>
      } />

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Link to="/study/difficult" className="card-surface flex items-center gap-3 rounded-3xl p-4 transition active:scale-[.98]">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-rose-500/10 text-rose-500"><AlertTriangle size={20} /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-bold">{t('difficultCards')}</span><span className="text-xs opacity-55">{hard} {t('cards')}</span></span>
        </Link>
        <Link to="/study/bookmarks" className="card-surface flex items-center gap-3 rounded-3xl p-4 transition active:scale-[.98]">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-500/10 text-amber-500"><Bookmark size={20} /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-bold">{t('bookmarks')}</span><span className="text-xs opacity-55">{marks} {t('cards')}</span></span>
        </Link>
      </div>

      {folders.length > 0 && (
        <section className="mb-5 space-y-2.5">
          {folders.map((f) => <FolderRow key={f.id} data={d} folder={f} onEdit={() => setEdit(f)} />)}
        </section>
      )}

      {roots.length > 0 ? <DeckTree data={d} decks={roots} />
        : d.decks.length === 0 && (
          <Empty icon={<Layers size={28} />} title={t('noDecksYet')} sub={t('noDecksSub')} action={<div className="flex gap-2"><Button onClick={() => nav('/deck/new')}>{t('createDeck')}</Button><Button variant="secondary" onClick={() => nav('/explore')}>{t('browseExplore')}</Button></div>} />
        )}

      {archived.length > 0 && (
        <section className="mt-6">
          <button onClick={() => setShowArch(!showArch)} className="mb-2 flex items-center gap-2 text-sm font-bold opacity-55 hover:opacity-100">📦 {t('archived')} ({archived.length}) {showArch ? '▾' : '▸'}</button>
          {showArch && <div className="opacity-70"><DeckTree data={d} decks={archived} /></div>}
        </section>
      )}

      <FolderSheet folder={edit} onClose={() => setEdit(null)} onSaved={(f) => { setEdit(null); if (!edit?.id) nav(`/folder/${f.id}`); }} />
    </div>
  );
}

export function FolderPage() {
  const { id } = useParams();
  const d = useData();
  const { t } = useT();
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const folder = d.folders.find((f) => f.id === id);
  const decks = useMemo(() => d.decks.filter((x) => x.folderId === id && !x.parentId && !x.archived).sort((a, b) => b.updatedAt - a.updatedAt), [d.decks, id]);
  if (!folder) return <Empty icon={<Layers size={28} />} title={t('notFound')} action={<Button onClick={() => nav('/decks')}>{t('decks')}</Button>} />;
  const due = todayCount(d, `folder:${id}`);
  const allIds = decks.flatMap((x) => deckTree(x.id, d.decks));

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <IconButton label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>
        <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-xl', COLORS[folder.color ?? 'violet'])}>{folder.emoji ?? '📁'}</div>
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-extrabold">{folder.name}</h1><p className="text-sm opacity-55">{t('decksCount', { n: decks.length })}</p></div>
        <IconButton label={t('folderSettings')} onClick={() => setEdit(true)}><Settings size={20} /></IconButton>
        <IconButton label={t('delete')} className="text-rose-500" onClick={async () => {
          if (await confirmDialog(`${t('delete')} "${folder.name}"?`, { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteFolder(folder.id); toast(t('deleted')); nav('/decks', { replace: true }); }
        }}><Trash2 size={19} /></IconButton>
      </div>
      <div className="mb-5 flex gap-2">
        <Button block icon={<Play size={18} className="fill-white" />} disabled={!allIds.length} onClick={() => nav(`/study/folder:${folder.id}`)}>{t('study')}{due ? ` · ${due}` : ''}</Button>
        <Button variant="secondary" className="whitespace-nowrap" icon={<Plus size={18} />} onClick={() => nav(`/deck/new?folder=${folder.id}`)}>{t('addDeckHere')}</Button>
      </div>
      {decks.length ? <DeckTree data={d} decks={decks} /> : <Empty icon={<Layers size={28} />} title={t('emptyFolder')} action={<Button onClick={() => nav(`/deck/new?folder=${folder.id}`)}>{t('createDeck')}</Button>} />}
      <FolderSheet folder={edit ? folder : null} onClose={() => setEdit(false)} onSaved={() => setEdit(false)} />
    </div>
  );
}

export function FolderSheet({ folder, onClose, onSaved }: { folder: Partial<Folder> | null; onClose: () => void; onSaved: (f: Folder) => void }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📁');
  const [color, setColor] = useState('violet');
  const [err, setErr] = useState('');
  const [openedFor, setOpenedFor] = useState<Partial<Folder> | null>(null);
  if (folder && folder !== openedFor) { setOpenedFor(folder); setName(folder.name ?? ''); setEmoji(folder.emoji ?? '📁'); setColor(folder.color ?? 'violet'); setErr(''); }
  return (
    <Sheet open={!!folder} onClose={onClose} title={folder?.id ? t('folderSettings') : t('newFolder')}>
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setErr(t('required'));
        if (name.length > 60) return setErr(t('tooLong', { n: 60 }));
        const f = saveFolder(name, folder?.id, { emoji, color });
        toast(t('saved')); onSaved(f);
      }}>
        <Field label={t('folderName')} error={err}><input autoFocus className={cx('input', err && 'err')} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
        <div><span className="mb-1.5 block text-sm font-semibold opacity-80">{t('icon')}</span>
          <div className="grid grid-cols-8 gap-1">
            {FOLDER_EMOJI.map((e) => <button type="button" key={e} onClick={() => setEmoji(e)} aria-pressed={emoji === e} className={cx('grid aspect-square place-items-center rounded-xl text-xl', emoji === e ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-500/20' : 'hover:bg-ink-900/5')}>{e}</button>)}
          </div>
        </div>
        <div><span className="mb-1.5 block text-sm font-semibold opacity-80">{t('colour')}</span>
          <div className="flex gap-2">{Object.entries(COLORS).map(([k, v]) => <button type="button" key={k} aria-label={k} onClick={() => setColor(k)} className={cx('h-8 flex-1 rounded-xl bg-gradient-to-br', v, color === k && 'ring-2 ring-ink-900 ring-offset-2 dark:ring-white dark:ring-offset-ink-800')} />)}</div>
        </div>
        <Button type="submit" block size="lg">{t('save')}</Button>
      </form>
    </Sheet>
  );
}
