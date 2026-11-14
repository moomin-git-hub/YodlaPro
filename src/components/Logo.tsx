export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7c5cff" /><stop offset="1" stopColor="#ff6fa8" /></linearGradient></defs>
      <rect width="512" height="512" rx="120" fill="url(#lg)" />
      <rect x="132" y="150" width="230" height="270" rx="36" fill="#fff" opacity=".35" transform="rotate(-10 247 285)" />
      <rect x="150" y="120" width="230" height="270" rx="36" fill="#fff" />
      <path d="M215 215l50 60 50-60M265 275v60" stroke="#6d4aff" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
export function Logo() {
  return <div className="flex items-center gap-2.5"><LogoMark /><span className="text-xl font-extrabold tracking-tight">Yodla</span></div>;
}
