import { useTranslation } from 'react-i18next';
import styles from './ImpactIndicator.module.css';

// Etapa 11, punto 11: "Impacto: 2 de 60 registros (3.33%)" en vez de "2
// registros afectados" — con advertencia visual si el porcentaje supera
// warningThresholdPercent (10% por defecto, mismo criterio documentado en
// docs/data-testing/etapa-11-rediseno-reporte-ejecucion.md).
export function ImpactIndicator({ affected = 0, total = null, warningThresholdPercent = 10 }) {
  const { t } = useTranslation();

  if (total === null || total === undefined) {
    return <span className={styles.unknown}>—</span>;
  }

  const percent = total > 0 ? Math.round((affected / total) * 10000) / 100 : 0;
  const isWarning = percent > warningThresholdPercent;

  return (
    <div className={styles.wrapper}>
      <span className={[styles.percent, isWarning && styles.warning].filter(Boolean).join(' ')}>
        {percent}%
      </span>
      <span className={styles.detail}>{t('dataTesting.impactDetail', { affected, total })}</span>
    </div>
  );
}
