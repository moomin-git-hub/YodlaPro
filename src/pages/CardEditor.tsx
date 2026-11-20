import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Trash2, X, Bookmark, AlertTriangle } from 'lucide-react';
import { useData, addCards, addOcclusion, saveOcclusionNote, occOf, updateCard, deleteCards, noteOf, hasReverse, saveBasicNote, getData, type OccMask } from '../lib/store';
import { Repeat } from 'lucide-react';
import { useT } from '../lib/i18n';
import { compressImage, cx } from '../lib/util';
import { storeImage } from '../lib/api';
import { formatDuration } from '../lib/srs';
import { Button, Field, IconButton, PageHeader, Toggle, confirmDialog, toast } from '../components/ui';
import { RichEditor } from '../components/RichEditor';
import { OcclusionEditor } from '../components/OcclusionEditor';
import { isBlank, plainText, clozeIndices } from '../lib/rich';
import { aiAssist } from '../lib/ai';
import { getUser } from '../lib/auth';
import { cloudEnabled } from '../lib/api';

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
  type Kind = 'basic' | 'cloze' | 'occlusion';
  const [kind, setKind] = useState<Kind>(card?.cardType === 'cloze' || card?.cardType === 'occlusion' ? card.cardType : 'basic');
  const basic = kind === 'basic';
  const occ0 = card?.cardType === 'occlusion' ? occOf(card) : null;
  const [masks, setMasks] = useState<OccMask[]>(occ0?.masks ?? []);
  const [occMode, setOccMode] = useState<'all' | 'one'>(occ0?.mode === 'one' ? 'one' : 'all');
  const isCloze = kind === 'cloze' || (kind === 'basic' && clozeIndices(f.front).length > 0 && !card);
  const [reversed, setReversed] = useState(card ? hasReverse(card) : false);
  const noteSize = card ? noteOf(card).length : 1;
  const [busyImg, setBusyImg] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  if (id && !card) return <p className="p-8 text-center opacity-60">{t('notFound')}</p>;

  const [editorKey, setEditorKey] = useState(0);
  /** AI toolbar actions: fill/improve fields of this card through the server. */
  const ai = (side: 'front' | 'back') => async (action: string) => {
    if (!cloudEnabled || getUser()?.mode !== 'cloud') { toast(t('aiNeedsServer'), 'err'); return; }
    const act = action === 'answer' && side === 'front' && isBlank(f.front) ? 'question' : action;
    try {
      const r = await aiAssist(f.front, f.back, act);
      const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
      setF((x) => {
        if (act === 'improve') return { ...x, front: r.front ? esc(r.front) : x.front, back: r.back ? esc(r.back) : x.back };
        if (act === 'example') return { ...x, example: r.text };
        if (act === 'explanation') return { ...x, explanation: r.text };
        if (act === 'question') return { ...x, front: esc(r.text) };
        return { ...x, back: esc(r.text) };
      });
      if (act === 'improve' || act === 'question') setEditorKey((k) => k + 1);
    } catch (e) { toast((e as Error).message, 'err'); }
  };
  const validate = () => {
    const e: Record<string, string> = {};
    if (!deckId) e.deck = t('selectDeck');
    const occ = kind === 'occlusion', cloze = kind === 'cloze' || isCloze;
    // cloze notes have no separate answer; image-occlusion notes have the image instead of a question
    if (occ) {
      if (!f.image) e.image = t('imageRequired'); else if (!masks.length) e.image = t('masksRequired');
    } else if (isBlank(f.front)) e.front = t('required');
    else if (cloze && !clozeIndices(f.front).length) e.front = t('clozeRequired');
    else if (plainText(f.front).length > 2000) e.front = t('tooLong', { n: 2000 });
    if (!occ && !cloze && isBlank(f.back)) e.back = t('required'); else if (plainText(f.back).length > 4000) e.back = t('tooLong', { n: 4000 });
    if (f.example.length > 2000) e.example = t('tooLong', { n: 2000 });
    if (f.explanation.length > 4000) e.explanation = t('tooLong', { n: 4000 });
    setErrs(e);
    return !Object.keys(e).length;
  };
  const save = (again: boolean) => {
    if (!validate()) return;
    localStorage.setItem('yodla:lastDeck', deckId);
    if (card) {
      if (kind === 'occlusion') saveOcclusionNote(card, { ...f, ...flags, deckId }, { masks, mode: occMode });
      else saveBasicNote(card, { ...f, ...flags, deckId }, basic && !isCloze && reversed);
      toast(t('saved')); nav(-1); return;
    }
    const [c] = kind === 'occlusion' ? addOcclusion(deckId, f, { masks, mode: occMode }) : addCards(deckId, [f]);
    if (flags.difficult || flags.bookmarked) updateCard(c.id, flags);
    if (reversed && basic && !isCloze) saveBasicNote(getData().cards.find((x) => x.id === c.id)!, {}, true);
    toast(t('cardAdded'));
    if (again) { setF(blank); setMasks([]); setFlags({ difficult: false, bookmarked: false }); setEditorKey((k) => k + 1); }
    else nav(`/deck/${deckId}`, { replace: true });
  };
  const submit = (e: FormEvent) => { e.preventDefault(); save(false); };

  return (
    <form onSubmit={submit} noValidate className="space-y-4" onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(!card); } }}>
      <PageHeader title={card ? (noteSize > 1 ? `(${noteSize}) ${t('editCards')}` : t('edit')) : t('addCard')} back={<IconButton type="button" label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>} />
      <Field label={t('chooseDeck')} error={errs.deck}>
        <div className="flex gap-2">
          <select className={cx('input', errs.deck && 'err')} value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            <option value="">{t('selectDeck')}</option>
            {d.decks.map((x) => <option key={x.id} value={x.id}>{x.cover} {x.title}</option>)}
          </select>
          <Button type="button" variant="secondary" className="shrink-0" onClick={() => nav(`/deck/new?return=${encodeURIComponent('/card/new')}`)}>{t('orCreateNew')}</Button>
        </div>
      </Field>
      {kind === 'occlusion' ? (
        <>
          {f.image ? <OcclusionEditor image={f.image} masks={masks} onMasks={setMasks} mode={occMode} onMode={setOccMode} onChangeImage={() => fileRef.current?.click()} />
            : <button type="button" onClick={() => fileRef.current?.click()} className={cx('flex w-full flex-col items-center gap-1 rounded-3xl border-2 border-dashed py-10 text-sm font-semibold transition hover:border-brand-400', errs.image ? 'border-rose-400' : 'border-ink-900/15 dark:border-white/15')}>
              {busyImg ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ImagePlus size={28} className="text-brand-500" />}
              <span className="font-bold">{t('occPick')}</span><span className="text-xs opacity-60">{t('occPickSub')}</span>
            </button>}
          {errs.image && <span role="alert" className="block text-xs font-medium text-rose-500">{errs.image}</span>}
          <Field label={t('occHeader')}><input className="input" value={plainText(f.front)} onChange={(e) => setF({ ...f, front: e.target.value.replace(/&/g, '&amp;').replace(/</g, '&lt;') })} placeholder={t('occHeaderPh')} /></Field>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink-900/80 dark:text-white/80">{t('backExtra')}</span>
            <RichEditor key={'b' + editorKey} value={f.back} onChange={(v) => setF((x) => ({ ...x, back: v }))} placeholder={t('backPh')} minHeight={80} onOcclusion={!card ? () => { setKind('basic'); setErrs({}); } : undefined} occActive />
          </div>
        </>
      ) : (<>
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-ink-900/80 dark:text-white/80">{kind === 'cloze' ? t('clozeText') : t('front')}</span>
        <RichEditor key={'f' + editorKey} value={f.front} onChange={(v) => setF((x) => ({ ...x, front: v }))} placeholder={kind === 'cloze' ? t('clozePh') : t('frontPh')} error={!!errs.front} autoFocus={!card} big minHeight={110} onAi={ai('front')} onCloze={!card || card.cardType === 'cloze' ? () => setKind('cloze') : undefined} onOcclusion={!card ? () => { setKind('occlusion'); setErrs({}); } : undefined} />
        {errs.front ? <span role="alert" className="mt-1.5 block text-xs font-medium text-rose-500">{errs.front}</span> : (kind === 'cloze' || isCloze) && <span className="mt-1.5 block text-xs font-semibold opacity-60">{t('clozeHelp', { n: clozeIndices(f.front).length })}</span>}
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-semibold text-ink-900/80 dark:text-white/80">{kind === 'cloze' || isCloze ? t('backExtra') : t('back')}</span>
        <RichEditor key={'b' + editorKey} value={f.back} onChange={(v) => setF((x) => ({ ...x, back: v }))} placeholder={t('backPh')} error={!!errs.back} minHeight={110} onAi={ai('back')}
          // a blank made in the answer: question + answer become one fill-in-the-blank text ("Capital of France<br>{{c1::Paris}}")
          onCloze={!card || card.cardType === 'cloze' ? () => { setF((x) => ({ ...x, front: x.front && !isBlank(x.front) ? `${x.front}<br>${x.back}` : x.back, back: '' })); setKind('cloze'); setEditorKey((k) => k + 1); } : undefined}
          onOcclusion={!card ? () => { setKind('occlusion'); setErrs({}); } : undefined} />
        {errs.back && <span role="alert" className="mt-1.5 block text-xs font-medium text-rose-500">{errs.back}</span>}
      </div>
      </>)}
      <Field label={t('example')} optional error={errs.example}><textarea className="input min-h-[60px] resize-y" value={f.example} onChange={(e) => setF({ ...f, example: e.target.value })} placeholder={t('examplePh')} /></Field>
      <Field label={t('explanation')} optional error={errs.explanation}><textarea className="input min-h-[60px] resize-y" value={f.explanation} onChange={(e) => setF({ ...f, explanation: e.target.value })} placeholder={t('explanationPh')} /></Field>
      {kind !== 'occlusion' && <div>
        <span className="mb-1.5 block text-sm font-semibold opacity-80">{t('image')}</span>
        {f.image ? (
          <div className="relative inline-block"><img src={f.image} alt="" className="max-h-48 rounded-2xl" /><button type="button" onClick={() => setF({ ...f, image: '' })} aria-label={t('removeImage')} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink-900/70 text-white"><X size={16} /></button></div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-900/15 py-6 text-sm font-semibold opacity-70 transition hover:border-brand-400 hover:opacity-100 dark:border-white/15">
            {busyImg ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ImagePlus size={18} />}{t('addImage')}
          </button>
        )}
      </div>}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        setBusyImg(true);
        try { const img = await storeImage(await compressImage(file, kind === 'occlusion' ? 1600 : undefined)); setF((s) => ({ ...s, image: img })); setErrs((x) => ({ ...x, image: '' })); } catch { toast(t('pdfError'), 'err'); } finally { setBusyImg(false); e.target.value = ''; }
      }} />
      <div className="card-surface divide-y divide-ink-900/5 rounded-3xl px-4 dark:divide-white/5">
        {basic && !isCloze && <label className="flex items-center justify-between py-3"><span className="flex items-center gap-2 text-sm font-semibold"><Repeat size={16} className="text-brand-500" />{t('alsoReversed')}</span><Toggle label={t('alsoReversed')} checked={reversed} onChange={setReversed} /></label>}
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
            <Button type="button" variant="secondary" className="text-rose-500" icon={<Trash2 size={18} />} onClick={async () => { if (await confirmDialog(t('confirmDeleteCards', { n: noteSize }), { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteCards(noteOf(card).map((x) => x.id)); toast(t('deleted')); nav(-1); } }}>{t('delete')}</Button>
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
