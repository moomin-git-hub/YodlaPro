import { useEffect, useState, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { initAuth, onAuth, recoveryMode, type AuthUser } from './lib/auth';
import { loadUser, useData, getData } from './lib/store';
import { ConfirmHost, ToastHost } from './components/ui';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Decks } from './pages/Decks';
import { DeckDetail } from './pages/DeckDetail';
import { DeckEditor } from './pages/DeckEditor';
import { CardEditor } from './pages/CardEditor';
import { Study } from './pages/Study';
import { Explore, PublicDeckPage } from './pages/Explore';
import { Create } from './pages/Create';
import { ImportPage } from './pages/Import';
import { Profile } from './pages/Profile';
import { Stats } from './pages/Stats';
import { SearchPage } from './pages/Search';
import { AuthPage, SetNewPassword } from './pages/Auth';
import { Onboarding, GoalSetup } from './pages/Onboarding';
import { NotFound } from './pages/NotFound';
import { ls } from './lib/util';
import { isDue } from './lib/srs';
import { todayStats } from './lib/stats';
import { translate } from './lib/i18n';

const AiGenerator = lazy(() => import('./pages/AiGenerator'));

function useTheme() {
  const theme = useData().settings.theme;
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.classList.toggle('dark', dark);
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b0a16' : '#f7f7fb');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function useReminders() {
  const s = useData().settings;
  useEffect(() => {
    if (!s.reminderEnabled || !('Notification' in window)) return;
    const check = async () => {
      if (Notification.permission !== 'granted') return;
      const [h, m] = s.reminderTime.split(':').map(Number);
      const at = new Date(); at.setHours(h, m, 0, 0);
      const key = 'yodla:reminded', today = new Date().toDateString();
      if (Date.now() < at.getTime() || ls.get(key, '') === today) return;
      const d = getData();
      const due = d.cards.filter((c) => isDue(c)).length;
      if (todayStats(d).reviews >= d.settings.dailyGoal) return;
      ls.set(key, today);
      const title = translate(s.lang, 'studyReminderTitle'), body = translate(s.lang, 'studyReminderBody', { n: due || d.settings.newPerDay });
      const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
      if (reg) reg.showNotification(title, { body, icon: './icon.svg', tag: 'yodla-daily' });
      else new Notification(title, { body });
    };
    check();
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, [s.reminderEnabled, s.reminderTime, s.lang]);
}

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [loaded, setLoaded] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [seenIntro, setSeenIntro] = useState(() => ls.get('yodla:intro', false));
  const data = useData();
  useTheme();
  useReminders();

  useEffect(() => {
    let cur: string | null | undefined;
    const handle = async (u: AuthUser | null) => {
      if ((u?.id ?? null) === cur) { setUser(u); setRecovery(recoveryMode); return; }
      cur = u?.id ?? null;
      setLoaded(false);
      await loadUser(u);
      setUser(u);
      setRecovery(recoveryMode);
      setLoaded(true);
    };
    initAuth().then(handle);
    const off = onAuth(handle);
    return () => { off(); };
  }, []);

  useEffect(() => { document.documentElement.lang = data.settings.lang; }, [data.settings.lang]);

  if (user === undefined || !loaded) return <Splash />;
  const hosts = <><ToastHost /><ConfirmHost /></>;
  if (recovery) return <>{hosts}<SetNewPassword onDone={() => setRecovery(false)} /></>;
  if (!user) {
    if (!seenIntro) return <>{hosts}<Onboarding onDone={() => { ls.set('yodla:intro', true); setSeenIntro(true); }} /></>;
    return <>{hosts}<AuthPage /></>;
  }
  if (!data.settings.onboarded) return <>{hosts}<GoalSetup /></>;

  return (
    <HashRouter>
      {hosts}
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/study/:target" element={<Study />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="decks" element={<Decks />} />
            <Route path="deck/new" element={<DeckEditor />} />
            <Route path="deck/:id" element={<DeckDetail />} />
            <Route path="deck/:id/edit" element={<DeckEditor />} />
            <Route path="card/new" element={<CardEditor />} />
            <Route path="card/:id/edit" element={<CardEditor />} />
            <Route path="explore" element={<Explore />} />
            <Route path="explore/:id" element={<PublicDeckPage />} />
            <Route path="create" element={<Create />} />
            <Route path="create/ai" element={<AiGenerator />} />
            <Route path="create/import" element={<ImportPage />} />
            <Route path="profile" element={<Profile />} />
            <Route path="stats" element={<Stats />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="home" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}

function Splash() {
  return <div className="grid h-full place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" /></div>;
}
