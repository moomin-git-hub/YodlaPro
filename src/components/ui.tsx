import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import { cx } from '../lib/util';
import { COLORS } from '../lib/catalog';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; loading?: boolean; block?: boolean };
export function Button({ variant = 'primary', size = 'md', icon, loading, block, className, children, disabled, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[.97] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'h-9 px-3.5 text-sm', size === 'md' && 'h-11 px-5 text-[15px]', size === 'lg' && 'h-14 px-6 text-base',
        variant === 'primary' && 'bg-brand-500 text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600',
        variant === 'secondary' && 'card-surface text-ink-900 hover:bg-ink-100 dark:text-white dark:hover:bg-ink-700',
        variant === 'soft' && 'bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-200 dark:hover:bg-brand-500/25',
        variant === 'ghost' && 'text-ink-900/70 hover:bg-ink-900/5 dark:text-white/70 dark:hover:bg-white/5',
        variant === 'danger' && 'bg-rose-500 text-white hover:bg-rose-600',
        block && 'w-full', className,
      )}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} {...rest} className={cx('grid h-10 w-10 place-items-center rounded-xl text-ink-900/70 transition hover:bg-ink-900/5 active:scale-95 dark:text-white/70 dark:hover:bg-white/10', className)}>
      {children}
    </button>
  );
}

export function Field({ label, error, hint, children, optional }: { label: string; error?: string; hint?: string; children: ReactNode; optional?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-semibold text-ink-900/80 dark:text-white/80">
        {label}{optional && <span className="text-xs font-normal opacity-50">optional</span>}
      </span>
      {children}
      {error ? <span role="alert" className="mt-1.5 block text-xs font-medium text-rose-500">{error}</span> : hint ? <span className="mt-1.5 block text-xs opacity-55">{hint}</span> : null}
    </label>
  );
}

export function Sheet({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade bg-ink-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cx('relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] animate-slide-up sm:animate-pop sm:rounded-[28px] dark:bg-ink-800', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-ink-200 sm:hidden dark:bg-white/10" />
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{title}</h2>
            <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ---------- confirm ----------
type ConfirmReq = { msg: string; danger?: boolean; ok?: string; cancel?: string; resolve: (v: boolean) => void };
let confirmReq: ConfirmReq | null = null;
const cSubs = new Set<() => void>();
export function confirmDialog(msg: string, opts: { danger?: boolean; ok?: string; cancel?: string } = {}) {
  return new Promise<boolean>((resolve) => { confirmReq = { msg, ...opts, resolve }; cSubs.forEach((f) => f()); });
}
export function ConfirmHost() {
  const req = useSyncExternalStore((f) => { cSubs.add(f); return () => cSubs.delete(f); }, () => confirmReq);
  const close = (v: boolean) => { req?.resolve(v); confirmReq = null; cSubs.forEach((f) => f()); };
  return (
    <Sheet open={!!req} onClose={() => close(false)}>
      <p className="mb-6 pt-2 text-[15px] leading-relaxed">{req?.msg}</p>
      <div className="flex gap-3">
        <Button variant="secondary" block onClick={() => close(false)}>{req?.cancel ?? 'Cancel'}</Button>
        <Button variant={req?.danger ? 'danger' : 'primary'} block onClick={() => close(true)} autoFocus>{req?.ok ?? 'OK'}</Button>
      </div>
    </Sheet>
  );
}

// ---------- toast ----------
type T = { id: number; msg: string; kind: 'ok' | 'err' };
let toasts: T[] = [];
const tSubs = new Set<() => void>();
export function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const t = { id: Date.now() + Math.random(), msg, kind };
  toasts = [...toasts, t]; tSubs.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); tSubs.forEach((f) => f()); }, 2800);
}
export function ToastHost() {
  const list = useSyncExternalStore((f) => { tSubs.add(f); return () => tSubs.delete(f); }, () => toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={cx('pointer-events-auto flex animate-pop items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl', t.kind === 'ok' ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'bg-rose-500 text-white')}>
          {t.kind === 'ok' ? <Check size={16} /> : <AlertCircle size={16} />}{t.msg}
        </div>
      ))}
    </div>
  );
}

export function Ring({ value, size = 120, stroke = 12, children, color = 'var(--color-brand-500)' }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-ink-900/[.06] dark:text-white/10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function Bars({ values, labels, height = 120, highlightLast = true, format = (v: number) => String(v) }: { values: number[]; labels: string[]; height?: number; highlightLast?: boolean; format?: (v: number) => string }) {
  const max = Math.max(1, ...values);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5" style={{ height }} role="img" aria-label={values.map((v, i) => `${labels[i]}: ${format(v)}`).join(', ')}>
        {values.map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onTouchStart={() => setHover(i)}>
            {hover === i && <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-[11px] font-bold text-white dark:bg-white dark:text-ink-900">{format(v)}</div>}
            <div className={cx('w-full rounded-lg transition-all duration-500', v === 0 ? 'bg-ink-900/[.06] dark:bg-white/[.07]' : highlightLast && i === values.length - 1 ? 'bg-brand-500' : 'bg-brand-300 dark:bg-brand-400/70')} style={{ height: v === 0 ? 4 : `${Math.max(6, (v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {labels.map((l, i) => <div key={i} className="flex-1 truncate text-center text-[10px] font-semibold uppercase opacity-45">{l}</div>)}
      </div>
    </div>
  );
}

export function DeckCover({ cover, color, image, size = 'md' }: { cover: string; color: string; image?: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'h-11 w-11 text-xl rounded-xl' : size === 'lg' ? 'h-20 w-20 text-4xl rounded-3xl' : 'h-14 w-14 text-2xl rounded-2xl';
  if (image) return <img src={image} alt="" className={cx(s, 'shrink-0 object-cover')} />;
  return <div className={cx(s, 'grid shrink-0 place-items-center bg-gradient-to-br shadow-inner', COLORS[color] ?? COLORS.violet)}><span className="drop-shadow-sm">{cover}</span></div>;
}

export function Empty({ icon, title, sub, action }: { icon: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex animate-fade flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-brand-50 text-brand-500 dark:bg-brand-500/15">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      {sub && <p className="mt-1 max-w-xs text-sm opacity-60">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex rounded-2xl bg-ink-900/[.05] p-1 dark:bg-white/[.06]" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition', value === o.value ? 'bg-white shadow-sm dark:bg-ink-700' : 'opacity-60 hover:opacity-90')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={cx('shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95', active ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'card-surface opacity-80 hover:opacity-100')}>
      {children}
    </button>
  );
}

export function PageHeader({ title, sub, right, back }: { title: string; sub?: string; right?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-5 flex items-center gap-3 pt-1">
      {back}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[26px] font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="text-sm opacity-55">{sub}</p>}
      </div>
      {right}
    </header>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-brand-500' : 'bg-ink-900/15 dark:bg-white/15')}>
      <span className={cx('absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  );
}

export function useAutoFocus<T extends HTMLElement>() {
  const r = useRef<T>(null);
  useEffect(() => { if (matchMedia('(pointer:fine)').matches) r.current?.focus(); }, []);
  return r;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-ink-900/[.07] dark:bg-white/10', className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 transition-all duration-700" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
