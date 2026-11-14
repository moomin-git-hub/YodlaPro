import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search as SearchIcon, X } from 'lucide-react';
import { useData } from '../lib/store';
import { useT } from '../lib/i18n';
import { plainText } from '../lib/rich';
import { DeckCover, IconButton, useAutoFocus } from '../components/ui';

function Hl({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-brand-200 px-0.5 text-inherit dark:bg-brand-500/40">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export function SearchPage() {
  const d = useData();
  const { t } = useT();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const ref = useAutoFocus<HTMLInputElement>();
  const res = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 1) return null;
    const decks = d.decks.filter((x) => `${x.title} ${x.description}`.toLowerCase().includes(s)).slice(0, 10);
    const cards = d.cards.filter((c) => plainText(`${c.front} ${c.back}`) + ` ${c.example} ${c.explanation}`.toLowerCase().includes(s)).slice(0, 100);
    return { decks, cards };
  }, [q, d]);
  const deckOf = (id: string) => d.decks.find((x) => x.id === id);
  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <IconButton label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>
        <div className="relative flex-1">
          <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40" />
          <input ref={ref} autoFocus className="input pl-11 pr-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchAll')} aria-label={t('search')} type="search" />
          {q && <button onClick={() => setQ('')} aria-label={t('clear')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-50"><X size={18} /></button>}
        </div>
      </div>
      {!res ? <p className="py-16 text-center text-sm opacity-50">{t('typeToSearch')}</p>
        : !res.decks.length && !res.cards.length ? <p className="py-16 text-center text-sm opacity-50">{t('noResults')}</p>
        : (
          <div className="space-y-5">
            {res.decks.length > 0 && (
              <section><h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider opacity-45">{t('decks')}</h2>
                <div className="space-y-2">{res.decks.map((x) => (
                  <Link key={x.id} to={`/deck/${x.id}`} className="card-surface flex items-center gap-3 rounded-2xl p-3"><DeckCover cover={x.cover} color={x.color} image={x.image} size="sm" /><span className="font-bold"><Hl text={x.title} q={q.trim()} /></span></Link>
                ))}</div>
              </section>
            )}
            {res.cards.length > 0 && (
              <section><h2 className="mb-2 text-xs font-extrabold uppercase tracking-wider opacity-45">{res.cards.length} {t('cards')}</h2>
                <ul className="space-y-2">{res.cards.map((c) => (
                  <li key={c.id}><Link to={`/card/${c.id}/edit`} className="card-surface block rounded-2xl p-3.5">
                    <p className="font-bold"><Hl text={plainText(c.front)} q={q.trim()} /></p>
                    <p className="line-clamp-2 text-sm opacity-65"><Hl text={plainText(c.back)} q={q.trim()} /></p>
                    <p className="mt-1 text-[11px] font-semibold opacity-45">{deckOf(c.deckId)?.cover} {deckOf(c.deckId)?.title}</p>
                  </Link></li>
                ))}</ul>
              </section>
            )}
          </div>
        )}
    </div>
  );
}
