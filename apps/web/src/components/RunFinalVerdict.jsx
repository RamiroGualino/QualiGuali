import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import styles from './RunFinalVerdict.module.css';

// Etapa 11, punto 12: checklist de conclusiones + veredicto final. Cada ítem
// es una lectura directa de datos que `run` ya trae (columnCoverage,
// results agrupados por scope, overallStatus) — no evalúa nada nuevo, sólo
// resume en lenguaje de negocio lo que el resto de la pantalla ya muestra en
// detalle.
export function RunFinalVerdict({ columnCoverage = [], results = [], overallStatus }) {
  const { t } = useTranslation();

  const allColumnsFound = columnCoverage.every((entry) => entry.found);
  const tableResults = results.filter((result) => result.expected !== undefined);
  const columnResults = results.filter((result) => result.expected === undefined);
  const tableRulesPassed = tableResults.every((result) => result.status === 'passed');
  const columnRulesPassed = columnResults.every((result) => result.status === 'passed');
  const passed = overallStatus === 'passed';

  const checklist = [
    { key: 'columnsFound', ok: allColumnsFound, label: t('dataTesting.finalChecklistColumnsFound') },
    { key: 'tableRules', ok: tableRulesPassed, label: t('dataTesting.finalChecklistTableRules') },
    { key: 'columnRules', ok: columnRulesPassed, label: t('dataTesting.finalChecklistColumnRules') },
    { key: 'overallStatus', ok: passed, label: t('dataTesting.finalChecklistOverallStatus') },
  ];

  return (
    <Card className={styles.card}>
      <h3 className={styles.title}>{t('dataTesting.finalSummaryTitle')}</h3>
      <ul className={styles.checklist}>
        {checklist.map((item) => (
          <li key={item.key} className={styles.item}>
            <span className={item.ok ? styles.ok : styles.notOk} aria-hidden="true">
              {item.ok ? '✔' : '✖'}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
      <p className={[styles.verdict, passed ? styles.pass : styles.fail].join(' ')}>
        <span aria-hidden="true">{passed ? '✔' : '❌'}</span>{' '}
        <span>{t(passed ? 'dataTesting.verdictPassed' : 'dataTesting.verdictFailed')}</span>
      </p>
    </Card>
  );
}
