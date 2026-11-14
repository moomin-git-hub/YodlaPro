import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, FolderPlus, Search, AlertTriangle, Bookmark, Layers, MoreHorizontal, Folder as FolderIcon } from 'lucide-react';
import { useData, saveFolder, deleteFolder } from '../lib/store';
import { useT } from '../lib/i18n';
import { deckStats } from '../lib/stats';
import { isHard } from '../lib/srs';
import { CATEGORIES, catKey } from '../lib/catalog';
import { Button, Chip, DeckCover, Empty, IconButton, PageHeader, ProgressBar, Sheet, Field, confirmDialog, toast } from '../components/ui';

export function Decks() {
  const d = useData();
  const { t } = useT();
  const nav = useNavigate();
  const [folder, setFolder] = useState<string>('all');
  const [cat, setCat] = useState('all');
  const [folderSheet, setFolderSheet] = useState<{ id?: string; name: string } | null>(null);
  const [err, setErr] = useState('');

  const list = useMemo(() => d.decks
    .filter((x) => folder === 'all' || (folder === 'none' ? !x.folderId : x.folderId === folder))
    .filter((x) => cat === 'all' || x.category === cat)
    .map((deck) => ({ deck, ...deckStats(d.cards.filter((c) => c.deckId === deck.id)) }))
    .sort((a, b) => b.due - a.due || b.deck.updatedAt - a.deck.updatedAt), [d, folder, cat]);
  const hard = d.cards.filter(isHard).length;
  const marks = d.cards.filter((c) => c.bookmarked).length;
  const usedCats = CATEGORIES.filter((c) => d.decks.some((x) => x.category === c.id));

  const submitFolder = () => {
    const name = folderSheet?.name.trim() ?? '';
    if (!name) return setErr(t('required'));
    if (name.length > 40) return setErr(t('tooLong', { n: 40 }));
    const f = saveFolder(name, folderSheet?.id);
    setFolderSheet(null); setErr(''); setFolder(f.id); toast(t('saved'));
  };

  return (
    <div>
      <PageHeader title={t('decks')} sub={`${d.decks.length} · ${d.cards.length} ${t('cards')}`} right={
        <div className="flex gap-1">
          <IconButton label={t('search')} onClick={() => nav('/search')}><Search size={20} /></IconButton>
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

      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <Chip active={folder === 'all'} onClick={() => setFolder('all')}>{t('all')}</Chip>
        {d.folders.map((f) => (
          <Chip key={f.id} active={folder === f.id} onClick={() => (folder === f.id ? setFolderSheet({ id: f.id, name: f.name }) : setFolder(f.id))}>
            <span className="flex items-center gap-1.5"><FolderIcon size={14} />{f.name}{folder === f.id && <MoreHorizontal size={14} />}</span>
          </Chip>
        ))}
        {d.folders.length > 0 && <Chip active={folder === 'none'} onClick={() => setFolder('none')}>{t('noFolder')}</Chip>}
        <Chip onClick={() => setFolderSheet({ name: '' })}><span className="flex items-center gap-1.5"><FolderPlus size={14} />{t('newFolder')}</span></Chip>
      </div>
      {usedCats.length > 1 && (
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          <button onClick={() => setCat('all')} className={`shrink-0 text-sm font-semibold ${cat === 'all' ? 'text-brand-600 dark:text-brand-300' : 'opacity-50'}`}>{t('category')}: {t('all')}</button>
          {usedCats.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={`shrink-0 text-sm font-semibold ${cat === c.id ? 'text-brand-600 dark:text-brand-300' : 'opacity-50'}`}>{c.emoji} {t(c.key)}</button>)}
        </div>
      )}

      {list.length === 0 ? (
        <Empty icon={<Layers size={28} />} title={t('noDecksYet')} sub={t('noDecksSub')} action={<div className="flex gap-2"><Button onClick={() => nav('/deck/new')}>{t('createDeck')}</Button><Button variant="secondary" onClick={() => nav('/explore')}>{t('browseExplore')}</Button></div>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((x) => (
            <Link key={x.deck.id} to={`/deck/${x.deck.id}`} className="card-surface group rounded-[26px] p-4 transition hover:-translate-y-0.5 active:scale-[.99]">
              <div className="flex items-start gap-3">
                <DeckCover cover={x.deck.cover} color={x.deck.color} image={x.deck.image} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold">{x.deck.title}</p>
                  <p className="truncate text-xs opacity-55">{t(catKey(x.deck.category))} · {x.total} {t('cards')}</p>
                </div>
                {x.due > 0 && <span className="rounded-full bg-brand-500 px-2.5 py-1 text-xs font-extrabold text-white">{x.due}</span>}
              </div>
              <ProgressBar value={x.progress} className="mt-4" />
              <div className="mt-2 flex justify-between text-[11px] font-semibold opacity-55">
                <span>{x.new} {t('newCards').toLowerCase()} · {x.learning} {t('learning').toLowerCase()}</span><span>{x.mastered} {t('mastered').toLowerCase()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Sheet open={!!folderSheet} onClose={() => { setFolderSheet(null); setErr(''); }} title={folderSheet?.id ? t('rename') : t('newFolder')}>
        <form onSubmit={(e) => { e.preventDefault(); submitFolder(); }} className="space-y-4">
          <Field label={t('folderName')} error={err}>
            <input autoFocus className={`input ${err ? 'err' : ''}`} value={folderSheet?.name ?? ''} onChange={(e) => setFolderSheet((s) => s && { ...s, name: e.target.value })} maxLength={60} />
          </Field>
          <div className="flex gap-3">
            {folderSheet?.id && <Button type="button" variant="danger" onClick={async () => {
              if (await confirmDialog(`${t('delete')} "${folderSheet.name}"?`, { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteFolder(folderSheet.id!); setFolder('all'); setFolderSheet(null); toast(t('deleted')); }
            }}>{t('delete')}</Button>}
            <Button type="submit" block>{t('save')}</Button>
          </div>
        </form>
      </Sheet>
    </div>
  );
}
