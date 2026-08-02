import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from './StatusBadge';
import { ProgressBar } from './ProgressBar';
import { ImpactIndicator } from './ImpactIndicator';
import { ExpectedVsActualComparison } from './ExpectedVsActualComparison';
import { FailureSampleTable } from './FailureSampleTable';
import { friendlyExpectationName, friendlyExpectationDescription } from '../utils/expectationCatalog';
import { resultSuccessPercent } from '../utils/resultSuccessPercent';
import { resultImpact } from '../utils/resultImpact';
import { findSuiteSnapshotEntry } from '../utils/suiteSnapshotLookup';
import { formatExpectationText } from '../utils/expectationText';
import styles from './RuleResultCard.module.css';

// Etapa 11, puntos 3/6/7/8/9/10/11: una card por Regla de Validación en vez
// de una fila de tabla técnica — nombre y descripción en lenguaje de
// negocio (utils/expectationCatalog.js), % de éxito como barra (ProgressBar,
// reusado tal cual de TestCasesPage), impacto como "X de Y (Z%)"
// (ImpactIndicator), y resumen colapsado por defecto: el detalle (punto 9)
// sólo se arma al expandir, para no cargar el DOM de listas grandes que el
// usuario nunca llega a mirar.
//
// scope table (expected/actual, sin column/columns — ver ValidationRun.js#
// resultSchema) muestra la comparación Esperado -> Obtenido; scope column/
// multicolumn muestra la tabla de fallas Registro/Valor/Motivo.
//
// `suiteSnapshot` (pedido directo del usuario tras confundirse con una regla
// de "Tipo de dato válido" que no decía QUÉ tipo esperaba): `result` no
// guarda los `params` con los que se configuró la regla (ver
// ValidationRun.js#resultSchema) pero `run.suiteSnapshot` sí — se busca la
// entrada correspondiente (findSuiteSnapshotEntry) y, si tiene parámetros,
// se muestra su resumen ("Tipo de dato: Texto", "Entre 18 y 65", etc.) vía
// el mismo formatExpectationText que ya usa el editor de Suites.
export function RuleResultCard({ result, totalRecords = null, suiteSnapshot = [] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const name = friendlyExpectationName(result.expId, t);
  const description = friendlyExpectationDescription(result.expId, t);
  const columnLabel = result.column || result.columns?.join(', ') || null;
  const percent = resultSuccessPercent(result);
  const impact = resultImpact(result, totalRecords);
  const isTableScope = result.expected !== undefined;

  const snapshotEntry = findSuiteSnapshotEntry(suiteSnapshot, result);
  const hasConfiguredParams =
    snapshotEntry && snapshotEntry.params && Object.keys(snapshotEntry.params).length > 0;
  const paramsSummary = hasConfiguredParams ? formatExpectationText(snapshotEntry, t) : null;

  return (
    <div className={styles.card}>
      <button
        type="button"
        className={styles.summaryRow}
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <div className={styles.mainInfo}>
          <span className={styles.name}>{name}</span>
          <span className={styles.description}>{description}</span>
          {paramsSummary && <span className={styles.paramsSummary}>{paramsSummary}</span>}
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>{t('dataTesting.columnHeader')}</span>
          <span>{columnLabel || '—'}</span>
        </div>
        <div className={styles.cell}>
          <StatusBadge status={result.status} label={t(`dataTesting.status_${result.status}`)} />
        </div>
        <div className={styles.percentCell}>
          <span className={styles.cellLabel}>{t('dataTesting.successPercentHeader')}</span>
          <ProgressBar percent={percent} label={`${percent}%`} tone="pass" remainderTone="fail" />
        </div>
        <div className={styles.cell}>
          <span className={styles.cellLabel}>{t('dataTesting.impactLabel')}</span>
          <ImpactIndicator affected={impact?.affected ?? 0} total={impact?.total ?? null} />
        </div>
        <span className={styles.chevron} aria-hidden="true">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className={styles.detail}>
          <div className={styles.explanation}>
            <h4 className={styles.detailTitle}>{t('dataTesting.ruleExplanationTitle')}</h4>
            <p className={styles.explanationText}>{description}</p>
          </div>
          {isTableScope ? (
            <ExpectedVsActualComparison
              expected={result.expected}
              actual={result.actual}
              matches={result.status === 'passed'}
            />
          ) : (
            result.status === 'failed' && (
              <div>
                <h4 className={styles.detailTitle}>{t('dataTesting.failureDetailTitle')}</h4>
                <FailureSampleTable
                  samples={result.unexpectedSample}
                  affectedRecords={result.affectedRecords}
                  reason={name}
                />
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
