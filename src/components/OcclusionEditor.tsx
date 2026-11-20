import { useRef, useState } from 'react';
import { Trash2, Undo2, Eraser, ImagePlus } from 'lucide-react';
import { uid, cx } from '../lib/util';
import { useT } from '../lib/i18n';
import type { OccMask } from '../lib/store';

type Draft = { x0: number; y0: number; x: number; y: number } | null;
const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** Drag on the image to draw a mask, click a mask to select it. Coordinates are fractions (0..1) of the image, like on Android. */
export function OcclusionEditor({ image, masks, onMasks, onChangeImage, mode, onMode }: {
  image: string; masks: OccMask[]; onMasks: (m: OccMask[]) => void; onChangeImage: () => void; mode: 'all' | 'one'; onMode: (m: 'all' | 'one') => void;
}) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [sel, setSel] = useState<string | null>(null);
  const pt = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };
  const hit = (x: number, y: number) => [...masks].reverse().find((m) => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h);
  const rect = (d: NonNullable<Draft>) => ({ x: Math.min(d.x0, d.x), y: Math.min(d.y0, d.y), w: Math.abs(d.x - d.x0), h: Math.abs(d.y - d.y0) });

  return (
    <div className="space-y-3">
      <p className="text-xs opacity-60">{t('occHelp')}</p>
      <div ref={box} className="relative mx-auto inline-block max-w-full touch-none select-none overflow-hidden rounded-2xl"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = pt(e); setDraft({ x0: p.x, y0: p.y, ...p }); }}
        onPointerMove={(e) => { if (draft) setDraft({ ...draft, ...pt(e) }); }}
        onPointerUp={(e) => {
          if (!draft) return;
          const r = rect({ ...draft, ...pt(e) }); setDraft(null);
          if (r.w > 0.012 && r.h > 0.012) { const m = { id: uid(), ...r }; onMasks([...masks, m]); setSel(m.id); }
          else setSel(hit(draft.x0, draft.y0)?.id ?? null);
        }}
        onPointerCancel={() => setDraft(null)}>
        <img src={image} alt="" draggable={false} className="block max-h-[60vh] max-w-full" />
        {masks.map((m) => (
          <div key={m.id} className={cx('absolute rounded-md', m.id === sel ? 'border-[3px] border-brand-500 bg-rose-500/80' : 'bg-rose-500/75')}
            style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }} />
        ))}
        {draft && <div className="absolute rounded-md border-2 border-dashed border-brand-500 bg-brand-500/25" style={{ left: `${rect(draft).x * 100}%`, top: `${rect(draft).y * 100}%`, width: `${rect(draft).w * 100}%`, height: `${rect(draft).h * 100}%` }} />}
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip disabled={!sel} onClick={() => { onMasks(masks.filter((m) => m.id !== sel)); setSel(null); }}><Trash2 size={15} />{t('deleteMask')}</Chip>
        <Chip disabled={!masks.length} onClick={() => { onMasks(masks.slice(0, -1)); setSel(null); }}><Undo2 size={15} />{t('undo')}</Chip>
        <Chip disabled={!masks.length} onClick={() => { onMasks([]); setSel(null); }}><Eraser size={15} />{t('clear')}</Chip>
        <Chip onClick={onChangeImage}><ImagePlus size={15} />{t('changeImage')}</Chip>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-ink-900/[.05] p-1 dark:bg-white/10">
        {(['all', 'one'] as const).map((m) => (
          <button key={m} type="button" onClick={() => onMode(m)} className={cx('rounded-xl px-2 py-2 text-xs font-bold transition', mode === m ? 'bg-white shadow dark:bg-ink-700' : 'opacity-60')}>{t(m === 'all' ? 'hideAllGuessOne' : 'hideOneGuessOne')}</button>
        ))}
      </div>
      <p className="text-xs font-semibold opacity-60">{t('masksCount', { n: masks.length })}</p>
    </div>
  );
}

function Chip({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex items-center gap-1.5 rounded-xl bg-ink-900/5 px-3 py-2 text-xs font-bold transition hover:bg-ink-900/10 disabled:opacity-35 dark:bg-white/10">{children}</button>;
}
