import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import styles from './ColumnCoverageCard.module.css';

// Etapa 11, punto 5: reemplaza la Table gigante de Cobertura de Columnas
// (una fila por columna esperada, dos celdas de texto "Sí"/"No") por una
// lista compacta con ícono, del mismo `run.columnCoverage` sin cambios.
export function ColumnCoverageCard({ columnCoverage = [] }) {
  const { t } = useTranslation();
  const foundCount = columnCoverage.filter((entry) => entry.found).length;

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{t('dataTesting.columnCoverageTitle')}</h3>
      <ul className={styles.list}>
        {columnCoverage.map((entry) => (
          <li key={entry.expectedColumn} className={styles.item}>
            <span
              className={[styles.icon, entry.found ? styles.found : styles.missing].join(' ')}
              aria-hidden="true"
            >
              {entry.found ? '✔' : '✕'}
            </span>
            <span>{entry.expectedColumn}</span>
          </li>
        ))}
      </ul>
      <p className={styles.footer}>
        {t('dataTesting.columnCoverageFound', {
          found: foundCount,
          total: columnCoverage.length,
        })}
      </p>
    </Card>
  );
}
