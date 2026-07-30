import { useTranslation } from 'react-i18next';
import styles from './SearchBar.module.css';

export function SearchBar({ value = '', onChange = () => {}, placeholder = '' }) {
  const { t } = useTranslation();

  return (
    <div className={styles.wrapper}>
      <span className={styles.icon} aria-hidden="true">
        🔍
      </span>
      <input
        type="search"
        className={styles.input}
        value={value}
        placeholder={placeholder || t('common.search')}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t('common.search')}
      />
      {value && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange('')}
          aria-label={t('common.clear')}
        >
          ✕
        </button>
      )}
    </div>
  );
}
