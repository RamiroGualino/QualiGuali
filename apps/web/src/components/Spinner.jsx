import { useTranslation } from 'react-i18next';
import styles from './Spinner.module.css';

// A small inline spinner — e.g. next to a "Running…" label while a Postman
// Suite executes (see PostmanSuitesPage). size in rem; no required props.
export function Spinner({ size = 1 }) {
  const { t } = useTranslation();
  return (
    <span
      className={styles.spinner}
      style={{ width: `${size}rem`, height: `${size}rem` }}
      role="status"
      aria-label={t('common.loading')}
    />
  );
}
