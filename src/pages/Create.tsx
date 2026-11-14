import { Link } from 'react-router-dom';
import { FolderPlus, PenLine, Sparkles, Upload, ChevronRight } from 'lucide-react';
import { useT } from '../lib/i18n';
import { PageHeader } from '../components/ui';

export function Create() {
  const { t } = useT();
  const items = [
    { to: '/create/ai', icon: Sparkles, title: t('aiGenerate'), sub: t('aiGenerateSub'), grad: 'from-violet-500 via-fuchsia-500 to-pink-500', hero: true },
    { to: '/deck/new', icon: FolderPlus, title: t('manualDeck'), sub: t('manualDeckSub'), grad: 'from-sky-500 to-indigo-500' },
    { to: '/card/new', icon: PenLine, title: t('manualCard'), sub: t('manualCardSub'), grad: 'from-emerald-500 to-teal-500' },
    { to: '/create/import', icon: Upload, title: t('importCards'), sub: t('importCardsSub'), grad: 'from-amber-400 to-orange-500' },
  ];
  return (
    <div>
      <PageHeader title={t('create')} sub={t('createSub')} />
      <div className="space-y-3">
        {items.map((i) => i.hero ? (
          <Link key={i.to} to={i.to} className={`relative block overflow-hidden rounded-[28px] bg-gradient-to-br ${i.grad} p-6 text-white shadow-xl shadow-fuchsia-500/25 transition active:scale-[.99]`}>
            <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/15" />
            <i.icon size={34} />
            <h2 className="mt-4 text-2xl font-extrabold">{i.title}</h2>
            <p className="mt-1 opacity-85">{i.sub}</p>
          </Link>
        ) : (
          <Link key={i.to} to={i.to} className="card-surface flex items-center gap-4 rounded-[26px] p-4 transition active:scale-[.99]">
            <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${i.grad} text-white`}><i.icon size={22} /></span>
            <span className="min-w-0 flex-1"><span className="block font-extrabold">{i.title}</span><span className="text-sm opacity-60">{i.sub}</span></span>
            <ChevronRight className="opacity-30" />
          </Link>
        ))}
      </div>
    </div>
  );
}
