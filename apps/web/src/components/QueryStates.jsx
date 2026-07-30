import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import styles from './QueryStates.module.css';

export function LoadingState() {
  const { t } = useTranslation();
  return <p className={styles.state}>{t('common.loading')}</p>;
}

export function ErrorState({ message = '', onRetry = null }) {
  const { t } = useTranslation();
  return (
    <div className={styles.state}>
      <p className={styles.errorText}>{message || t('common.errorGeneric')}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ message = '' }) {
  return <p className={styles.state}>{message}</p>;
}
