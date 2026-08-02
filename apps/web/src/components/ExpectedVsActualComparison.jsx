import { useTranslation } from 'react-i18next';
import styles from './ExpectedVsActualComparison.module.css';

// Etapa 11, punto 7: comparación visual Esperado -> Obtenido para
// resultados de scope Tabla (los únicos que traen `expected`/`actual` —
// Etapa 3, ValidationRun.js#resultSchema), en vez del texto plano
// "2 (Columna esperada: 3)" que mostraba la tabla anterior.
export function ExpectedVsActualComparison({ expected, actual, matches }) {
  const { t } = useTranslation();
  const format = (value) => (Array.isArray(value) ? value.join(', ') : String(value));

  return (
    <div className={styles.wrapper}>
      <div className={styles.value}>
        <span className={styles.label}>{t('dataTesting.expectedValueLabel')}</span>
        <span className={styles.text}>{format(expected)}</span>
      </div>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
      <div className={styles.value}>
        <span className={styles.label}>{t('dataTesting.actualValueLabel')}</span>
        <span className={styles.text}>{format(actual)}</span>
      </div>
      <span className={[styles.badge, matches ? styles.matches : styles.mismatch].join(' ')}>
        {matches ? `✔ ${t('dataTesting.matchesLabel')}` : `✖ ${t('dataTesting.doesNotMatchLabel')}`}
      </span>
    </div>
  );
}
