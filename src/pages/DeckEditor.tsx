import { useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Trash2 } from 'lucide-react';
import { useData, saveDeck, deleteDeck } from '../lib/store';
import { useT } from '../lib/i18n';
import { CATEGORIES, COLORS, EMOJIS } from '../lib/catalog';
import { compressImage, cx } from '../lib/util';
import { storeImage } from '../lib/api';
import { Button, DeckCover, Field, IconButton, PageHeader, confirmDialog, toast } from '../components/ui';

export function DeckEditor() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const d = useData();
  const { t } = useT();
  const nav = useNavigate();
  const existing = id ? d.decks.find((x) => x.id === id) : undefined;
  const [f, setF] = useState({
    title: existing?.title ?? '', description: existing?.description ?? '', category: existing?.category ?? 'general',
    folderId: existing?.folderId ?? sp.get('folder') ?? null, cover: existing?.cover ?? EMOJIS[Math.floor(Math.random() * 8)], color: existing?.color ?? Object.keys(COLORS)[Math.floor(Math.random() * 6)], image: existing?.image ?? '',
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  if (id && !existing) return <p className="p-8 text-center opacity-60">{t('notFound')}</p>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.title.trim()) er.title = t('titleRequired');
    else if (f.title.length > 80) er.title = t('tooLong', { n: 80 });
    if (f.description.length > 500) er.description = t('tooLong', { n: 500 });
    setErrs(er);
    if (Object.keys(er).length) return;
    const deck = saveDeck({ ...existing, ...f, title: f.title.trim(), description: f.description.trim() });
    toast(t('saved'));
    const ret = sp.get('return');
    nav(ret ? `${ret}${ret.includes('?') ? '&' : '?'}deck=${deck.id}` : `/deck/${deck.id}`, { replace: true });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <PageHeader title={existing ? t('editDeck') : t('manualDeck')} back={<IconButton type="button" label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>} />
      <div className="card-surface flex items-center gap-4 rounded-[28px] p-5">
        <DeckCover cover={f.cover} color={f.color} image={f.image} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold">{f.title || t('deckTitlePh')}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" size="sm" variant="soft" icon={<ImagePlus size={16} />} onClick={() => fileRef.current?.click()}>{t('addImage')}</Button>
            {f.image && <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, image: '' })}>{t('removeImage')}</Button>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
            const file = e.target.files?.[0]; if (!file) return;
            try { setF((s) => ({ ...s, image: '' })); const img = await storeImage(await compressImage(file, 400)); setF((s) => ({ ...s, image: img })); } catch { toast(t('pdfError'), 'err'); }
            e.target.value = '';
          }} />
        </div>
      </div>

      <Field label={t('title')} error={errs.title}><input className={cx('input', errs.title && 'err')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t('deckTitlePh')} maxLength={100} autoFocus={!existing} /></Field>
      <Field label={t('description')} error={errs.description} optional><textarea className={cx('input min-h-[90px] resize-y', errs.description && 'err')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t('deckDescPh')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('category')}>
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.emoji} {t(c.key)}</option>)}
          </select>
        </Field>
        <Field label={t('folder')}>
          <select className="input" value={f.folderId ?? ''} onChange={(e) => setF({ ...f, folderId: e.target.value || null })}>
            <option value="">{t('noFolder')}</option>
            {d.folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t('cover')}>
        <div className="card-surface rounded-3xl p-3">
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((e) => <button type="button" key={e} onClick={() => setF({ ...f, cover: e })} aria-pressed={f.cover === e} className={cx('grid aspect-square place-items-center rounded-xl text-xl transition', f.cover === e ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-500/20' : 'hover:bg-ink-900/5')}>{e}</button>)}
          </div>
          <div className="mt-3 flex gap-2">
            {Object.entries(COLORS).map(([k, v]) => <button type="button" key={k} aria-label={k} aria-pressed={f.color === k} onClick={() => setF({ ...f, color: k })} className={cx('h-8 flex-1 rounded-xl bg-gradient-to-br transition', v, f.color === k && 'ring-2 ring-ink-900 ring-offset-2 dark:ring-white dark:ring-offset-ink-800')} />)}
          </div>
        </div>
      </Field>
      <div className="flex gap-3 pt-2">
        {existing && <Button type="button" variant="secondary" className="text-rose-500" icon={<Trash2 size={18} />} onClick={async () => {
          const n = d.cards.filter((c) => c.deckId === existing.id).length;
          if (await confirmDialog(t('confirmDeleteDeck', { title: existing.title, n }), { danger: true, ok: t('delete'), cancel: t('cancel') })) { deleteDeck(existing.id); toast(t('deleted')); nav('/decks', { replace: true }); }
        }}>{t('delete')}</Button>}
        <Button type="submit" size="lg" block>{t('save')}</Button>
      </div>
    </form>
  );
}
