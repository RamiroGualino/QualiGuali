import { useTranslation } from 'react-i18next';
import { KpiCard } from './KpiCard';
import { DataQualityScoreCard } from './DataQualityScoreCard';
import { friendlyExpectationName } from '../utils/expectationCatalog';
import styles from './RunExecutiveSummary.module.css';

function percentOf(count, total) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

// Etiqueta de una regla dentro de la lista de Aprobadas/Falladas — con
// columna si la tiene (scope column/multicolumn), sin ella para scope Tabla
// (mismo prefijo que ya usa la previsualización en vivo del selector de
// Suites, para no inventar un formato nuevo).
function resultLabel(result, t) {
  const name = friendlyExpectationName(result.expId, t);
  const column = result.column || result.columns?.join(', ');
  return column ? `${column}: ${name}` : name;
}

// Etapa 11, puntos 1/2/13: el dashboard ejecutivo — Data Quality Score
// (DataQualityScoreCard, reusado) y una fila de KPIs (KpiCard, reusado de
// ProjectHomePage/ReportsDashboardPage) — mismos datos que ya traía `run`
// (results, columnCoverage), sin ningún campo nuevo del backend.
//
// Sin veredicto binario Aprobada/Fallida acá a propósito (pedido directo del
// usuario): con muchas reglas evaluadas, una sola falla menor (p.ej. un DNI
// vacío) alcanza para que `overallStatus` sea 'failed' — mostrar eso como
// titular grande es engañoso. El Data Quality Score (estadístico, ponderado
// por cuántas reglas pasaron) es la medida principal acá; el estado
// Aprobada/Fallida binario se sigue mostrando, sin ser el foco, en el badge
// de la barra superior (ExpectationRunDetailPage) y en el checklist final
// (RunFinalVerdict).
//
// Las cards de Aprobadas/Falladas listan QUÉ reglas son (pedido directo del
// usuario, "así sabes") — no sólo el %, cada nombre de regla debajo, con
// scroll propio si son muchas para no des-balancear el resto del dashboard.
export function RunExecutiveSummary({ score, results = [], recordsProcessed }) {
  const { t } = useTranslation();
  const totalRules = results.length;
  const passedResults = results.filter((result) => result.status === 'passed');
  const failedResults = results.filter((result) => result.status === 'failed');
  const passedRules = passedResults.length;
  const failedRules = failedResults.length;

  return (
    <div className={styles.wrapper}>
      <DataQualityScoreCard score={score} />

      <div className={styles.kpiGrid}>
        <KpiCard
          label={t('dataTesting.rulesPassedLabel')}
          value={`${percentOf(passedRules, totalRules)}%`}
          tone="pass"
          accent="pass"
          breakdown={[
            { value: passedRules, label: t('dataTesting.rulesRatioBreakdown', { total: totalRules }) },
          ]}
        >
          {passedResults.length > 0 && (
            <ul className={styles.ruleList}>
              {passedResults.map((result, index) => (
                <li key={`${result.expId}-${result.column || result.columns?.join('-') || index}`}>
                  {resultLabel(result, t)}
                </li>
              ))}
            </ul>
          )}
        </KpiCard>
        <KpiCard
          label={t('dataTesting.rulesFailedLabel')}
          value={`${percentOf(failedRules, totalRules)}%`}
          tone={failedRules > 0 ? 'fail' : 'default'}
          accent="fail"
          breakdown={[
            { value: failedRules, label: t('dataTesting.rulesRatioBreakdown', { total: totalRules }) },
          ]}
        >
          {failedResults.length > 0 && (
            <ul className={styles.ruleList}>
              {failedResults.map((result, index) => (
                <li key={`${result.expId}-${result.column || result.columns?.join('-') || index}`}>
                  {resultLabel(result, t)}
                </li>
              ))}
            </ul>
          )}
        </KpiCard>
        <KpiCard
          label={t('dataTesting.recordsProcessedLabel')}
          value={recordsProcessed ?? '—'}
          accent="info"
          breakdown={[{ value: '', label: t('dataTesting.rowsBreakdownLabel') }]}
        />
      </div>
    </div>
  );
}
