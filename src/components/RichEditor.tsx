import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bold, Italic, Underline, Strikethrough, Heading, List, ListOrdered, Subscript, Superscript, Sigma, Code, Link2, ImagePlus, Highlighter, Baseline, Sparkles, Code2, Eraser, Undo2, Redo2, Brackets, ScanSearch } from 'lucide-react';
import { sanitize, isHtml, toDisplayHtml, clozeIndices } from '../lib/rich';
import { compressImage, cx } from '../lib/util';
import { storeImage } from '../lib/api';
import { useT } from '../lib/i18n';
import { Sheet, Button, toast } from './ui';

const COLORS = ['#111827', '#6d4aff', '#e11d48', '#ea580c', '#16a34a', '#0284c7', '#a855f7', '#6b7280'];
const MARKS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', 'transparent'];

type AiAction = 'answer' | 'question' | 'example' | 'explanation' | 'improve';

function Btn({ label, on, children, active }: { label: string; on: () => void; children: ReactNode; active?: boolean }) {
  return (
    <button type="button" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={on}
      className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl transition hover:bg-ink-900/5 dark:hover:bg-white/10', active && 'bg-brand-500/15 text-brand-600 dark:text-brand-300')}>
      {children}
    </button>
  );
}

/**
 * WYSIWYG card editor (Noji-style toolbar). Value is sanitized HTML.
 * Legacy plain-text values are converted on first edit.
 */
export function RichEditor({ value, onChange, placeholder, minHeight = 120, error, autoFocus, onAi, onCloze, onOcclusion, occActive, big }: {
  value: string; onChange: (html: string) => void; placeholder?: string; minHeight?: number; error?: boolean; autoFocus?: boolean;
  onAi?: (a: AiAction) => Promise<void>; big?: boolean;
  /** shows the “make blank” button; called after a {{cN::…}} blank was inserted around the selection */
  onCloze?: () => void;
  /** shows the “image occlusion” button (switches the card to image occlusion; occActive = already in that mode) */
  onOcclusion?: () => void; occActive?: boolean;
}) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState(false);
  const [pop, setPop] = useState<'' | 'color' | 'mark' | 'ai' | 'math' | 'link'>('');
  const [mathTex, setMathTex] = useState('');
  const [link, setLink] = useState('https://');
  const [busy, setBusy] = useState(false);
  const saved = useRef<Range | null>(null);
  const last = useRef('');

  // Sync external value → DOM only when it differs from what we last emitted (keeps caret stable while typing).
  useEffect(() => {
    const el = ref.current;
    if (!el || source) return;
    if (value !== last.current) {
      el.innerHTML = value ? sanitize(isHtml(value) ? value : value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')) : '';
      last.current = value;
    }
  }, [value, source]);
  useEffect(() => { if (autoFocus && matchMedia('(pointer:fine)').matches) ref.current?.focus(); }, [autoFocus]);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    let html = el.innerHTML;
    if (html === '<br>' || html === '<div><br></div>') html = '';
    last.current = html;
    onChange(html);
  };
  const keepSel = () => { const s = getSelection(); if (s && s.rangeCount && ref.current?.contains(s.anchorNode)) saved.current = s.getRangeAt(0).cloneRange(); };
  const restoreSel = () => {
    ref.current?.focus();
    const s = getSelection();
    if (saved.current && s) { s.removeAllRanges(); s.addRange(saved.current); }
  };
  const cmd = (c: string, v?: string) => {
    restoreSel();
    document.execCommand('styleWithCSS', false, c === 'hiliteColor' || c === 'foreColor' ? 'true' : 'false');
    document.execCommand(c, false, v);
    emit(); keepSel();
  };
  const insertHtml = (html: string) => { restoreSel(); document.execCommand('insertHTML', false, html); emit(); keepSel(); };
  const toggleHeading = () => {
    const block = document.queryCommandValue('formatBlock').toLowerCase();
    cmd('formatBlock', block === 'h3' ? 'div' : 'h3');
  };
  const makeCloze = () => {
    restoreSel();
    const txt = getSelection()?.toString() ?? '';
    const used = clozeIndices(ref.current?.innerText ?? '');
    const n = (used.length ? Math.max(...used) : 0) + 1;
    insertHtml(`{{c${n}::${(txt || '…').replace(/&/g, '&amp;').replace(/</g, '&lt;')}}}`);
    onCloze?.();
  };
  const wrapCode = () => {
    restoreSel();
    const s = getSelection();
    const txt = s?.toString() ?? '';
    if (txt.includes('\n')) insertHtml(`<pre><code>${txt.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code></pre><div><br></div>`);
    else insertHtml(`<code>${(txt || 'code').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code>&nbsp;`);
  };

  return (
    <div className={cx('relative overflow-visible rounded-2xl border bg-white transition focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/15 dark:bg-ink-900', error ? 'border-rose-400' : 'border-ink-200 dark:border-white/10')}>
      {source ? (
        <textarea className="block w-full resize-y rounded-t-2xl bg-transparent px-4 py-3 font-mono text-sm outline-none" style={{ minHeight }} value={value} onChange={(e) => { last.current = ''; onChange(e.target.value); }} />
      ) : (
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          className={cx('rich-edit rich px-4 py-3 outline-none', big && 'text-[17px]')}
          style={{ minHeight }}
          onInput={emit}
          onBlur={() => { keepSel(); emit(); }}
          onKeyUp={keepSel}
          onMouseUp={keepSel}
          onPaste={(e) => {
            const html = e.clipboardData.getData('text/html');
            if (html) { e.preventDefault(); insertHtml(sanitize(html).replace(/ style="[^"]*"/g, '')); }
          }}
          onKeyDown={(e) => {
            if (onCloze && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); keepSel(); makeCloze(); return; }
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) { e.preventDefault(); cmd(e.key.toLowerCase() === 'b' ? 'bold' : e.key.toLowerCase() === 'i' ? 'italic' : 'underline'); }
          }}
        />
      )}
      <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto border-t border-ink-200/70 px-1.5 py-1 text-ink-900/80 dark:border-white/5 dark:text-white/80">
        {onCloze && <button type="button" title={t('makeCloze')} onMouseDown={(e) => e.preventDefault()} onClick={() => { keepSel(); makeCloze(); }} className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-brand-500/12 px-2.5 text-xs font-extrabold text-brand-600 transition hover:bg-brand-500/20 dark:text-brand-300"><Brackets size={16} />{t('makeCloze')}</button>}
        {onOcclusion && <button type="button" title={t('imageOcclusion')} onMouseDown={(e) => e.preventDefault()} onClick={onOcclusion} className={cx('flex h-9 shrink-0 items-center gap-1 rounded-xl px-2.5 text-xs font-extrabold transition', occActive ? 'bg-brand-500 text-white' : 'bg-brand-500/12 text-brand-600 hover:bg-brand-500/20 dark:text-brand-300')}><ScanSearch size={16} />{t('imageOcclusion')}</button>}
        <Btn label="Undo" on={() => cmd('undo')}><Undo2 size={18} /></Btn>
        <Btn label="Redo" on={() => cmd('redo')}><Redo2 size={18} /></Btn>
        {onAi && <Btn label="AI" on={() => { keepSel(); setPop(pop === 'ai' ? '' : 'ai'); }}><Sparkles size={18} className="text-fuchsia-500" /></Btn>}
        <Btn label={t('addImage')} on={() => { keepSel(); fileRef.current?.click(); }}><ImagePlus size={18} /></Btn>
        <Btn label={t('highlight')} on={() => { keepSel(); setPop(pop === 'mark' ? '' : 'mark'); }}><Highlighter size={18} /></Btn>
        <Btn label={t('textColor')} on={() => { keepSel(); setPop(pop === 'color' ? '' : 'color'); }}><Baseline size={18} /></Btn>
        <span className="mx-1 h-5 w-px shrink-0 bg-ink-900/10 dark:bg-white/10" />
        <Btn label="Bold" on={() => cmd('bold')}><Bold size={18} /></Btn>
        <Btn label="Italic" on={() => cmd('italic')}><Italic size={18} /></Btn>
        <Btn label="Underline" on={() => cmd('underline')}><Underline size={18} /></Btn>
        <Btn label="Strikethrough" on={() => cmd('strikeThrough')}><Strikethrough size={18} /></Btn>
        <Btn label="Heading" on={toggleHeading}><Heading size={18} /></Btn>
        <Btn label="Bullets" on={() => cmd('insertUnorderedList')}><List size={18} /></Btn>
        <Btn label="Numbered" on={() => cmd('insertOrderedList')}><ListOrdered size={18} /></Btn>
        <Btn label="Subscript" on={() => cmd('subscript')}><Subscript size={18} /></Btn>
        <Btn label="Superscript" on={() => cmd('superscript')}><Superscript size={18} /></Btn>
        <Btn label={t('formula')} on={() => { keepSel(); setMathTex(getSelection()?.toString() ?? ''); setPop('math'); }}><Sigma size={18} /></Btn>
        <Btn label="Code" on={wrapCode}><Code size={18} /></Btn>
        <Btn label="Link" on={() => { keepSel(); setLink('https://'); setPop('link'); }}><Link2 size={18} /></Btn>
        <Btn label={t('clearFormat')} on={() => cmd('removeFormat')}><Eraser size={18} /></Btn>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { if (source) last.current = ''; setSource(!source); }}
          className={cx('ml-auto flex shrink-0 items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold', source ? 'bg-brand-500 text-white' : 'bg-ink-900/5 dark:bg-white/10')}>
          <Code2 size={14} />{source ? t('done') : 'HTML'}
        </button>
      </div>

      {!source && /\$[^$]+\$|\\\(|\\\[/.test(value) && (
        <div className="border-t border-ink-200/70 px-4 py-2 dark:border-white/5">
          <span className="text-[10px] font-bold uppercase tracking-wide opacity-40">{t('preview')}</span>
          <RichView html={value} className="text-sm" />
        </div>
      )}

      {pop === 'color' || pop === 'mark' ? (
        <div className="absolute bottom-12 left-2 z-20 flex animate-pop gap-1.5 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-ink-900/10 dark:bg-ink-700">
          {(pop === 'color' ? COLORS : MARKS).map((c) => (
            <button key={c} type="button" aria-label={c} onMouseDown={(e) => e.preventDefault()} onClick={() => { cmd(pop === 'color' ? 'foreColor' : 'hiliteColor', c); setPop(''); }}
              className="h-7 w-7 rounded-full ring-1 ring-ink-900/15" style={{ background: c === 'transparent' ? 'repeating-linear-gradient(45deg,#fff,#fff 4px,#e5e7eb 4px,#e5e7eb 8px)' : c }} />
          ))}
        </div>
      ) : null}

      {pop === 'ai' && onAi && (
        <div className="absolute bottom-12 left-2 z-20 w-56 animate-pop overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-ink-900/10 dark:bg-ink-700">
          {(['answer', 'question', 'example', 'explanation', 'improve'] as AiAction[]).map((a) => (
            <button key={a} type="button" disabled={busy} onClick={async () => { setBusy(true); try { await onAi(a); } finally { setBusy(false); setPop(''); } }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold hover:bg-ink-900/5 disabled:opacity-50 dark:hover:bg-white/10">
              <Sparkles size={15} className="text-fuchsia-500" />{t(`ai_${a}` as 'ai_answer')}
            </button>
          ))}
          {busy && <div className="h-1 animate-pulse bg-gradient-to-r from-brand-500 to-fuchsia-500" />}
        </div>
      )}

      <Sheet open={pop === 'math'} onClose={() => setPop('')} title={t('formula')}>
        <input autoFocus className="input font-mono" value={mathTex} onChange={(e) => setMathTex(e.target.value)} placeholder="E = mc^2  ·  \frac{a}{b}  ·  \sqrt{x}" />
        <div className="rich my-4 min-h-[48px] rounded-2xl bg-ink-900/[.04] p-4 text-center text-lg dark:bg-white/5" dangerouslySetInnerHTML={{ __html: mathTex ? toDisplayHtml(`$${mathTex}$`) : '' }} />
        <div className="mb-4 flex flex-wrap gap-1.5">
          {['x^2', '\\frac{a}{b}', '\\sqrt{x}', '\\sum_{i=1}^{n}', '\\int_a^b', '\\alpha', '\\pi', '\\le', '\\ne', '\\infty', '\\vec{v}', 'H_2O'].map((s) => (
            <button key={s} type="button" onClick={() => setMathTex((m) => m + s)} className="rounded-xl bg-ink-900/5 px-2.5 py-1 font-mono text-xs dark:bg-white/10">{s}</button>
          ))}
        </div>
        <Button block disabled={!mathTex.trim()} onClick={() => { insertHtml(` $${mathTex.trim().replace(/</g, '&lt;')}$ `); setPop(''); }}>{t('insert')}</Button>
      </Sheet>

      <Sheet open={pop === 'link'} onClose={() => setPop('')} title="Link">
        <input autoFocus className="input" value={link} onChange={(e) => setLink(e.target.value)} type="url" />
        <Button block className="mt-4" disabled={!/^https?:\/\/\S+\.\S+/.test(link)} onClick={() => {
          restoreSel();
          const txt = getSelection()?.toString();
          if (txt) cmd('createLink', link); else insertHtml(`<a href="${link.replace(/"/g, '')}">${link.replace(/</g, '&lt;')}</a>&nbsp;`);
          setPop('');
        }}>{t('insert')}</Button>
      </Sheet>

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = '';
        if (!f) return;
        try {
          const url = await storeImage(await compressImage(f, 1000));
          insertHtml(`<img src="${url}" alt="">`);
        } catch { toast(t('pdfError'), 'err'); }
      }} />
    </div>
  );
}

/** Read-only renderer for card HTML/markdown with KaTeX. */
export function RichView({ html, className }: { html: string; className?: string }) {
  return <div className={cx('rich', className)} dangerouslySetInnerHTML={{ __html: toDisplayHtml(html) }} />;
}
