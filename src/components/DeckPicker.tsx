import { useNavigate, useLocation } from 'react-router-dom';
import { useData } from '../lib/store';
import { useT } from '../lib/i18n';
import { Button, Field } from './ui';
import { cx } from '../lib/util';

export function DeckPicker({ value, onChange, error }: { value: string; onChange: (id: string) => void; error?: string }) {
  const d = useData();
  const { t } = useT();
  const nav = useNavigate();
  const loc = useLocation();
  return (
    <Field label={t('chooseDeck')} error={error}>
      <div className="flex gap-2">
        <select className={cx('input', error && 'err')} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t('selectDeck')}</option>
          {d.decks.map((x) => <option key={x.id} value={x.id}>{x.cover} {x.title}</option>)}
        </select>
        <Button type="button" variant="secondary" className="shrink-0" onClick={() => nav(`/deck/new?return=${encodeURIComponent(loc.pathname)}`)}>{t('orCreateNew')}</Button>
      </div>
    </Field>
  );
}
