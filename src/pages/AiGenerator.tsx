import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Sparkles, FileText, Type, Lightbulb, Trash2, Settings2, Wand2, CheckCircle2 } from 'lucide-react';
import { addCards } from '../lib/store';
import { useT } from '../lib/i18n';
import { checkAi, generateCards, quickExtract, extractFileText, archiveUpload, type AiStatus } from '../lib/ai';
import { Button, Field, IconButton, PageHeader, Segmented, toast } from '../components/ui';
import { DeckPicker } from '../components/DeckPicker';
import type { DraftCard } from '../lib/types';
import { cx } from '../lib/util';

type Mode = 'topic' | 'text' | 'file';
const LANG_OPTS = ['English', "O'zbek", 'Русский', 'Español', 'Français', 'Deutsch', 'Türkçe', 'العربية', '中文', '日本語', '한국어'];

export default function AiGenerator() {
  const { t, lang } = useT();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [status, setStatus] = useState<AiStatus>('checking');
  const [mode, setMode] = useState<Mode>('topic');
  const [topic, setTopic] = useState('');
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [count, setCount] = useState(12);
  const [cardLang, setCardLang] = useState(lang === 'uz' ? "O'zbek" : lang === 'ru' ? 'Русский' : 'English');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [drafts, setDrafts] = useState<DraftCard[] | null>(null);
  const [deckId, setDeckId] = useState(sp.get('deck') ?? '');
  const [deckErr, setDeckErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { checkAi().then((r) => { setStatus(r.status); if (r.status !== 'ready') setMode((m) => (m === 'topic' ? 'text' : m)); }); }, []);
  const ready = status === 'ready';

  const source = mode === 'topic' ? '' : text;
  const validate = (needAi: boolean) => {
    if (needAi && mode === 'topic' && !topic.trim()) return t('topicRequired');
    if (mode !== 'topic' && source.trim().length < 20) return t('textTooShort');
    return '';
  };

  const run = async () => {
    const e = validate(true); setErr(e); if (e) return;
    setBusy(true);
    try {
      const cards = await generateCards({ topic: mode === 'topic' ? topic.trim() : undefined, text: mode === 'topic' ? undefined : source, count, language: cardLang });
      if (!cards.length) throw new Error('0 cards');
      setDrafts(cards);
    } catch (x) { setErr(t('aiError', { e: (x as Error).message })); } finally { setBusy(false); }
  };
  const runQuick = () => {
    const e = validate(false); setErr(e); if (e) return;
    const cards = quickExtract(source, 200);
    if (!cards.length) return setErr(t('parsed', { n: 0 }));
    setDrafts(cards);
  };

  const onFile = async (f: File) => {
    setBusy(true); setErr('');
    try { archiveUpload(f); const s = await extractFileText(f); setText(s); setFileName(f.name); toast(t('extractedFromFile', { n: s.length.toLocaleString() })); }
    catch { setErr(t('pdfError')); } finally { setBusy(false); }
  };

  const saveAll = () => {
    if (!drafts) return;
    const valid = drafts.filter((c) => c.front.trim() && c.back.trim());
    if (!deckId) return setDeckErr(t('selectDeck'));
    addCards(deckId, valid);
    toast(t('saveCards', { n: valid.length }));
    nav(`/deck/${deckId}`, { replace: true });
  };

  if (drafts) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('reviewGenerated', { n: drafts.length })} back={<IconButton label="Back" onClick={() => setDrafts(null)}><ArrowLeft size={22} /></IconButton>} />
        <DeckPicker value={deckId} onChange={(v) => { setDeckId(v); setDeckErr(''); }} error={deckErr} />
        <ul className="space-y-3">
          {drafts.map((c, i) => (
            <li key={i} className="card-surface rounded-3xl p-4">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-extrabold opacity-40">#{i + 1}</span>
                <IconButton label={t('delete')} onClick={() => setDrafts(drafts.filter((_, k) => k !== i))} className="h-8 w-8 text-rose-500"><Trash2 size={16} /></IconButton></div>
              <textarea aria-label={t('front')} className={cx('input mb-2 min-h-[52px] font-semibold', !c.front.trim() && 'err')} value={c.front} onChange={(e) => setDrafts(drafts.map((x, k) => (k === i ? { ...x, front: e.target.value } : x)))} />
              <textarea aria-label={t('back')} className={cx('input min-h-[52px]', !c.back.trim() && 'err')} value={c.back} onChange={(e) => setDrafts(drafts.map((x, k) => (k === i ? { ...x, back: e.target.value } : x)))} />
              {(c.example || c.explanation) && (
                <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold opacity-60">{t('example')} / {t('explanation')}</summary>
                  <textarea aria-label={t('example')} className="input mt-2 min-h-[44px] text-sm" value={c.example ?? ''} onChange={(e) => setDrafts(drafts.map((x, k) => (k === i ? { ...x, example: e.target.value } : x)))} placeholder={t('examplePh')} />
                  <textarea aria-label={t('explanation')} className="input mt-2 min-h-[44px] text-sm" value={c.explanation ?? ''} onChange={(e) => setDrafts(drafts.map((x, k) => (k === i ? { ...x, explanation: e.target.value } : x)))} placeholder={t('explanationPh')} />
                </details>
              )}
            </li>
          ))}
        </ul>
        <div className="sticky bottom-24 lg:bottom-4"><Button size="lg" block onClick={saveAll} disabled={!drafts.some((c) => c.front.trim() && c.back.trim())} className="shadow-2xl">{t('saveCards', { n: drafts.filter((c) => c.front.trim() && c.back.trim()).length })}</Button></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('aiGenerate')} sub={t('aiGenerateSub')} back={<IconButton label="Back" onClick={() => nav(-1)}><ArrowLeft size={22} /></IconButton>}
        right={status === 'checking' ? <span className="text-xs font-semibold opacity-50">{t('checkingAi')}</span> : ready ? <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={14} />{t('aiReady')}</span> : null} />

      {status === 'unconfigured' && (
        <section className="rounded-[28px] border-2 border-dashed border-brand-300 bg-brand-50/60 p-5 dark:border-brand-500/40 dark:bg-brand-500/5">
          <h2 className="flex items-center gap-2 font-extrabold"><Settings2 size={20} className="text-brand-500" />{t('aiNotConfigured')}</h2>
          <p className="mt-2 text-sm opacity-70">{t('aiSetupIntro')}</p>
          <ol className="mt-3 space-y-2 text-sm">
            {(['aiStep1', 'aiStep2', 'aiStep3', 'aiStep4'] as const).map((k, i) => (
              <li key={k} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white">{i + 1}</span><span className="pt-0.5">{t(k)}</span></li>
            ))}
          </ol>
          <p className="mt-4 flex gap-2 rounded-2xl bg-white/70 p-3 text-sm dark:bg-white/5"><Lightbulb size={18} className="shrink-0 text-amber-500" />{t('aiOffline')}</p>
        </section>
      )}

      <Segmented value={mode} onChange={(m) => { setMode(m); setErr(''); }} options={[
        { value: 'topic', label: <span className="flex items-center justify-center gap-1.5"><Sparkles size={15} />{t('aiTopic')}</span> },
        { value: 'text', label: <span className="flex items-center justify-center gap-1.5"><Type size={15} />{t('aiText')}</span> },
        { value: 'file', label: <span className="flex items-center justify-center gap-1.5"><FileText size={15} />{t('aiFile')}</span> },
      ]} />

      {mode === 'topic' && <Field label={t('aiTopic')} error={err && err === t('topicRequired') ? err : undefined}><input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('aiTopicPh')} maxLength={200} disabled={!ready && status !== 'checking'} /></Field>}
      {mode === 'text' && <Field label={t('aiText')} hint={`${text.length.toLocaleString()} / 60,000`}><textarea className="input min-h-[200px]" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('aiTextPh')} /></Field>}
      {mode === 'file' && (
        <div>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="flex w-full flex-col items-center gap-2 rounded-[28px] border-2 border-dashed border-ink-900/15 py-10 transition hover:border-brand-400 dark:border-white/15">
            {busy ? <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /> : <FileText size={32} className="text-brand-500" />}
            <span className="font-bold">{fileName || t('aiUpload')}</span>
            {text && <span className="text-xs opacity-55">{t('extractedFromFile', { n: text.length.toLocaleString() })}</span>}
          </button>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          {text && <textarea className="input mt-3 min-h-[120px] text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label={t('aiText')} />}
        </div>
      )}

      {ready && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t('numberOfCards')}: ${count}`}><input type="range" min={5} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-3 w-full accent-brand-500" /></Field>
          <Field label={t('cardLanguage')}><select className="input" value={cardLang} onChange={(e) => setCardLang(e.target.value)}>{LANG_OPTS.map((l) => <option key={l}>{l}</option>)}</select></Field>
        </div>
      )}
      {err && err !== t('topicRequired') && <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">{err}</p>}

      <div className="space-y-2 pt-1">
        {ready && <Button size="lg" block loading={busy} icon={<Sparkles size={18} />} onClick={run}>{busy ? t('generating') : t('generate')}</Button>}
        {mode !== 'topic' && <Button size="lg" block variant={ready ? 'secondary' : 'primary'} icon={<Wand2 size={18} />} onClick={runQuick} disabled={busy}>{t('quickExtract')}</Button>}
      </div>
    </div>
  );
}
