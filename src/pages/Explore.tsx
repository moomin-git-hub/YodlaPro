import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Search, Bookmark, ArrowLeft, Plus, Check, Layers, Compass } from 'lucide-react';
import { useData, saveDeck, addCards, toggleSavedPublic } from '../lib/store';
import { useT } from '../lib/i18n';
import { CATEGORIES, catKey } from '../lib/catalog';
import { fetchPublicDecks, fetchPublicCards } from '../lib/ai';
import { Button, Chip, DeckCover, Empty, IconButton, PageHeader, Segmented, toast } from '../components/ui';
import type { PublicDeck } from '../lib/types';
import { cx } from '../lib/util';

let cache: PublicDeck[] | null = null;
function usePublicDecks() {
  const [list, setList] = useState<PublicDeck[] | null>(cache);
  useEffect(() => { fetchPublicDecks().then((l) => { cache = l; setList(l); }); }, []);
  return list;
}

export function addPublicToLibrary(p: PublicDeck, cards: PublicDeck['cards']) {
  const deck = saveDeck({ title: p.title, description: p.description, category: p.category, cover: p.cover, color: p.color, sourcePublicId: p.id });
  addCards(deck.id, cards);
  return deck;
}

export function Explore() {
  const d = useData();
  const { t } = useT();
  const list = usePublicDecks();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [tab, setTab] = useState<'featured' | 'popular' | 'saved'>('featured');
  const owned = new Set(d.decks.map((x) => x.sourcePublicId));
  const hasSaves = list?.some((p) => (p.saves ?? 0) > 0);

  const shown = useMemo(() => {
    if (!list) return [];
    const s = q.trim().toLowerCase();
    let l = list.filter((p) => (cat === 'all' || p.category === cat) && (!s || `${p.title} ${p.description} ${p.cards.map((c) => c.front + ' ' + c.back).join(' ')}`.toLowerCase().includes(s)));
    if (tab === 'saved') l = l.filter((p) => d.savedPublic.includes(p.id));
    if (tab === 'popular') l = [...l].sort((a, b) => (b.saves ?? 0) - (a.saves ?? 0) || (b.cardCount ?? 0) - (a.cardCount ?? 0));
    return l;
  }, [list, q, cat, tab, d.savedPublic]);

  return (
    <div>
      <PageHeader title={t('explore')} sub={t('exploreSub')} />
      <div className="relative mb-4">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
        <input className="input pl-11" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchDecks')} aria-label={t('searchDecks')} />
      </div>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'featured', label: t('featured') }, ...(hasSaves ? [{ value: 'popular' as const, label: t('popular') }] : []), { value: 'saved', label: `${t('savedDecks')} (${d.savedPublic.length})` }]} />
      <div className="no-scrollbar -mx-4 my-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
        <Chip active={cat === 'all'} onClick={() => setCat('all')}>{t('all')}</Chip>
        {CATEGORIES.filter((c) => list?.some((p) => p.category === c.id)).map((c) => <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.emoji} {t(c.key)}</Chip>)}
      </div>
      {!list ? <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="card-surface h-40 animate-pulse rounded-[26px]" />)}</div>
        : shown.length === 0 ? <Empty icon={<Compass size={28} />} title={t('noResults')} />
        : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((p) => {
              const saved = d.savedPublic.includes(p.id);
              return (
                <div key={p.id} className="card-surface relative rounded-[26px] p-4 transition hover:-translate-y-0.5">
                  <Link to={`/explore/${p.id}`} className="block">
                    <div className="flex items-start gap-3 pr-10">
                      <DeckCover cover={p.cover} color={p.color} />
                      <div className="min-w-0">
                        <p className="font-extrabold leading-snug">{p.title}</p>
                        <p className="text-xs font-semibold opacity-55">{t(catKey(p.category))} · {p.cardCount ?? p.cards.length} {t('cards')}{p.saves ? ` · ♥ ${p.saves}` : ''}</p>
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm opacity-65">{p.description}</p>
                    {owned.has(p.id) && <p className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400"><Check size={14} />{t('added')}</p>}
                  </Link>
                  <IconButton label={saved ? t('removeBookmark') : t('saveDeck')} onClick={() => { toggleSavedPublic(p.id); toast(saved ? t('deleted') : t('saved')); }} className={cx('absolute right-3 top-3', saved && 'text-amber-500 dark:text-amber-400')}>
                    <Bookmark size={20} className={saved ? 'fill-current' : ''} />
                  </IconButton>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}

export function PublicDeckPage() {
  const { id } = useParams();
  const d = useData();
  const { t } = useT();
  const nav = useNavigate();
  const list = usePublicDecks();
  const p = list?.find((x) => x.id === id);
  const [cards, setCards] = useState<PublicDeck['cards'] | null>(null);
  useEffect(() => { if (p) fetchPublicCards(p).then(setCards); }, [p]);
  if (!list) return <div className="card-surface h-60 animate-pulse rounded-[28px]" />;
  if (!p) return <Empty icon={<Layers size={28} />} title={t('notFound')} action={<Button onClick={() => nav('/explore')}>{t('explore')}</Button>} />;
  const ownedDeck = d.decks.find((x) => x.sourcePublicId === p.id);
  const saved = d.savedPublic.includes(p.id);
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <IconButton label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>
        <IconButton label={t('saveDeck')} onClick={() => toggleSavedPublic(p.id)} className={saved ? 'text-amber-500 dark:text-amber-400' : ''}><Bookmark size={20} className={saved ? 'fill-current' : ''} /></IconButton>
      </div>
      <section className="card-surface rounded-[28px] p-5">
        <div className="flex items-start gap-4">
          <DeckCover cover={p.cover} color={p.color} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold leading-tight">{p.title}</h1>
            <p className="mt-1 text-xs font-semibold opacity-55">{t(catKey(p.category))} · {cards?.length ?? p.cardCount} {t('cards')} · {t('by', { a: p.author || '—' })}</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed opacity-70">{p.description}</p>
        <div className="mt-5">
          {ownedDeck ? <Button size="lg" block variant="soft" icon={<Check size={18} />} onClick={() => nav(`/deck/${ownedDeck.id}`)}>{t('openDeck')}</Button>
            : <Button size="lg" block icon={<Plus size={18} />} disabled={!cards?.length} onClick={() => { const deck = addPublicToLibrary(p, cards!); toast(t('saved')); nav(`/deck/${deck.id}`); }}>{t('addToLibrary')}</Button>}
        </div>
      </section>
      <h2 className="mb-3 mt-6 font-extrabold">{t('preview')}</h2>
      <ul className="space-y-2">
        {(cards ?? []).map((c, i) => (
          <li key={i} className="card-surface rounded-2xl p-4">
            <p className="font-bold">{c.front}</p>
            <p className="text-sm opacity-65">{c.back}</p>
            {c.example && <p className="mt-1 text-xs italic opacity-50">{c.example}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
