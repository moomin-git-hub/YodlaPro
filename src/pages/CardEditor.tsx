import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Trash2, X, Bookmark, AlertTriangle } from 'lucide-react';
import { useData, addCards, updateCard, deleteCards } from '../lib/store';
import { useT } from '../lib/i18n';
import { compressImage, cx } from '../lib/util';
import { storeImage } from '../lib/api';
import { formatDuration } from '../lib/srs';
import { Button, Field, IconButton, PageHeader, Toggle, confirmDialog, toast } from '../components/ui';

export function CardEditor() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const d = useData();
  const { t, locale } = useT();
  const nav = useNavigate();
  const card = id ? d.cards.find((c) => c.id === id) : undefined;
  const initialDeck = card?.deckId ?? sp.get('deck') ?? (d.decks.length === 1 ? d.decks[0].id : ls());
  function ls() { return localStorage.getItem('yodla:lastDeck') ?? ''; }
  const [deckId, setDeckId] = useState(d.decks.some((x) => x.id === initialDeck) ? initialDeck : '');
  const blank = { front: '', back: '', example: '', explanation: '', image: '' };
  const [f, setF] = useState(card ? { front: card.front, back: card.back, example: card.example, explanation: card.explanation, image: card.image } : blank);
  const [flags, setFlags] = useState({ difficult: card?.difficult ?? false, bookmarked: card?.bookmarked ?? false });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busyImg, setBusyImg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);
  if (id && !card) return <p className="p-8 text-center opacity-60">{t('notFound')}</p>;

  const validate = () => {
    const e: Record<string, string> = {};
    if (!deckId) e.deck = t('selectDeck');
    if (!f.front.trim()) e.front = t('required'); else if (f.front.length > 2000) e.front = t('tooLong', { n: 2000 });
    if (!f.back.trim()) e.back = t('required'); else if (f.back.length > 4000) e.back = t('tooLong', { n: 4000 });
    if (f.example.length > 2000) e.example = t('tooLong', { n: 2000 });
    if (f.explanation.length > 4000) e.explanation = t('tooLong', { n: 4000 });
    setErrs(e);
    return !Object.keys(e).length;
  };
  const save = (again: boolean) => {
    if (!validate()) return;
    localStorage.setItem('yodla:lastDeck', deckId);
    if (card) { updateCard(card.id, { ...f, ...flags, deckId, front: f.front.trim(), back: f.back.trim() }); toast(t('saved')); nav(-1); return; }
    const [c] = addCards(deckId, [f]);
    if (flags.difficult || flags.bookmarked) updateCard(c.id, flags);
    toast(t('cardAdded'));
    if (again) { setF(blank); setFlags({ difficult: false, bookmarked: false }); frontRef.current?.focus(); }
    else nav(`/deck/${deckId}`, { replace: true });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); save(false); };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(!card); } }}>
      <PageHeader title={card ? t('edit') : t('addCard')} back={<IconButton type="button" label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>} />
      <Field label={t('chooseDeck')} error={errs.deck}>
        <div className="flex gap-2">
          <select className={cx('input', errs.deck && 'err')} value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            <option value="">{t('selectDeck')}</option>
            {d.decks.map((x) => <option key={x.id} value={x.id}>{x.cover} {x.title}</option>)}
          </select>
          <Button type="button" variant="secondary" className="shrink-0" onClick={() => nav(`/deck/new?return=${encodeURIComponent('/card/new')}`)}>{t('orCreateNew')}</Button>
        </div>
      </Field>
      <Field label={t('front')} error={errs.front}><textarea ref={frontRef} autoFocus={!card} className={cx('input min-h-[88px] resize-y text-[17px] font-semibold', errs.front && 'err')} value={f.front} onChange={(e) => setF({ ...f, front: e.target.value })} placeholder={t('frontPh')} /></Field>
      <Field label={t('back')} error={errs.back}><textarea className={cx('input min-h-[88px] resize-y', errs.back && 'err')} value={f.back} onChange={(e) => setF({ ...f, back: e.target.value })} placeholder={t('backPh')} /></Field>
      <Field label={t('example')} optional error={errs.example}><textarea className="input min-h-[60px] resize-y" value={f.example} onChange={(e) => setF({ ...f, example: e.target.value })} placeholder={t('examplePh')} /></Field>
      <Field label={t('explanation')} optional error={errs.explanation}><textarea className="input min-h-[60px] resize-y" value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} placeholder={t('explanationPh')} /></Field>
      <div>
        <span className="mb-1.5 block text-sm font-semibold opacity-80">{t('image')}</span>
        {f.image ? (
          <div className="relative inline-block"><img src={f.image} alt="" className="max-h-48 rounded-2xl" /><button type="button" onClick={() => setF({ ...f, image: '' })} aria-label={t('removeImage')} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink-900/70 text-white"><X size={16} /></button></div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-900/15 py-6 text-sm font-semibold opacity-70 transition hover:border-brand-400 hover:opacity-100 dark:border-white/15">
            {busyImg ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ImagePlus size={18} />}{t('addImage')}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
          const file = e.target.files?.[0]; if (!file) return;
          setBusyImg(true);
          try { const img = await storeImage(await compressImage(file)); setF((s) => ({ ...s, image: img })); } catch { toast(t('pdfError'), 'err'); } finally { setBusyImg(false); e.target.value = ''; }
        }} />
      </div>
      <div className="card-surface divide-y divide-ink-900/5 rounded-3xl px-4 dark:divide-white/5">
        <label className="flex items-center justify-between py-3"><span className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle size={16} className="text-rose-500" />{t('markDifficult')}</span><Toggle label={t('markDifficult')} checked={flags.difficult} onChange={(v) => setFlags({ ...flags, difficult: v })} /></label>
        <label className="flex items-center justify-between py-3"><span className="flex items-center gap-2 text-sm font-semibold"><Bookmark size={16} className="text-amber-500" />{t('bookmark')}</span><Toggle label={t('bookmark')} checked={flags.bookmarked} onChange={(v) => setFlags({ ...flags, bookmarked: v })} /></label>
      </div>
      {card && card.status !== 'new' && (
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          {[[t('nextReview'), card.due <= Date.now() ? t('today') : new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(card.due)], [t('interval'), formatDuration(card.interval * 86400000)], [t('ease'), card.ease.toFixed(2)], [t('lapses'), card.lapses]].map(([l, v]) => (
            <div key={l as string} className="rounded-2xl bg-ink-900/[.04] p-2 dark:bg-white/5"><div className="font-extrabold">{v}</div><div className="truncate opacity-55">{l}</div></div>
          ))}
        </div>
      )}
      <div className="flex gap-2 pt-2">
        {card ? (
          <>
            <Button type="button" variant="secondary" className="text-rose-500" icon={<Trash2 size={18} />} onClick={async () => { if (await confirmDialog(t('confirmDeleteCards', { n: 1 }), { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteCards([card.id]); toast(t('deleted')); nav(-1); } }}>{t('delete')}</Button>
            <Button type="submit" size="lg" block>{t('save')}</Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" size="lg" block onClick={() => save(true)}>{t('saveAndAdd')}</Button>
            <Button type="submit" size="lg" block>{t('save')}</Button>
          </>
        )}
      </div>
    </form>
  );
}
