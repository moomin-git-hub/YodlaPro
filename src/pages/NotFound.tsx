import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n';

export function NotFound() {
  const { t } = useT();
  return (
    <div className="py-24 text-center">
      <p className="text-6xl font-extrabold text-brand-500">404</p>
      <p className="mt-2 opacity-60">{t('notFound')}</p>
      <Link to="/" className="mt-6 inline-block rounded-2xl bg-brand-500 px-5 py-3 font-bold text-white">{t('goHome')}</Link>
    </div>
  );
}
