import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Home, Layers, Compass, Plus, User, BarChart3, Search, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n';
import { cx, isTyping } from '../lib/util';
import { Logo } from './Logo';

export function Layout() {
  const { t } = useT();
  const nav = useNavigate();
  const loc = useLocation();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener('online', on); addEventListener('offline', off);
    return () => { removeEventListener('online', on); removeEventListener('offline', off); };
  }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') { e.preventDefault(); nav('/search'); }
      else if (e.key.toLowerCase() === 'n') { e.preventDefault(); nav('/card/new'); }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [nav]);
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  const items = [
    { to: '/', icon: Home, label: t('home'), end: true },
    { to: '/decks', icon: Layers, label: t('decks') },
    { to: '/create', icon: Plus, label: t('create'), primary: true },
    { to: '/explore', icon: Compass, label: t('explore') },
    { to: '/profile', icon: User, label: t('profile') },
  ];
  return (
    <div className="min-h-full lg:flex">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-200/70 bg-white/60 p-5 backdrop-blur lg:flex dark:border-white/5 dark:bg-ink-900/60">
        <div className="mb-8 px-2"><Logo /></div>
        <nav className="flex flex-col gap-1" aria-label="Main">
          {[...items.filter((i) => !i.primary), { to: '/stats', icon: BarChart3, label: t('stats') }, { to: '/search', icon: Search, label: t('search') }].map((i) => (
            <NavLink key={i.to} to={i.to} end={'end' in i ? i.end : false} className={({ isActive }) => cx('flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold transition', isActive ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25' : 'opacity-70 hover:bg-ink-900/5 hover:opacity-100 dark:hover:bg-white/5')}>
              <i.icon size={20} />{i.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={() => nav('/create')} className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-ink-900 py-3 font-bold text-white transition hover:opacity-90 dark:bg-white dark:text-ink-900"><Plus size={18} />{t('create')}</button>
        <p className="mt-auto px-2 text-xs opacity-40">{t('shortcutsList').split(' · ').slice(6).join(' · ')}</p>
      </aside>

      <main className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4 sm:px-6 lg:pb-12 lg:pt-8">
        {!online && <div className="mb-4 flex animate-fade items-center gap-2 rounded-2xl bg-amber-100 px-4 py-2.5 text-sm font-semibold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"><WifiOff size={16} />{t('offline')}</div>}
        <div key={loc.pathname} className="animate-fade"><Outlet /></div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200/60 bg-white/85 backdrop-blur-xl lg:hidden dark:border-white/5 dark:bg-ink-900/85 safe-bottom" aria-label="Main">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 pb-1 pt-1.5">
          {items.map((i) =>
            i.primary ? (
              <NavLink key={i.to} to={i.to} aria-label={i.label} className="-mt-6 grid h-14 w-14 place-items-center rounded-[20px] bg-gradient-to-br from-brand-500 to-fuchsia-500 text-white shadow-xl shadow-brand-500/40 transition active:scale-90">
                <Plus size={28} strokeWidth={2.5} />
              </NavLink>
            ) : (
              <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => cx('flex min-w-[60px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-bold transition', isActive ? 'text-brand-500 dark:text-brand-300' : 'opacity-50')}>
                {({ isActive }) => (<><i.icon size={23} strokeWidth={isActive ? 2.4 : 2} />{i.label}</>)}
              </NavLink>
            ),
          )}
        </div>
      </nav>
    </div>
  );
}
