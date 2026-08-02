import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { dataTestingApi } from '../api/dataTesting.api';
import { PageHeader } from '../components/PageHeader';
import { BackButton } from '../components/BackButton';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState } from '../components/QueryStates';
import { RunExecutiveSummary } from '../components/RunExecutiveSummary';
import { RunQualityCharts } from '../components/RunQualityCharts';
import { ColumnCoverageCard } from '../components/ColumnCoverageCard';
import { RuleResultCard } from '../components/RuleResultCard';
import { RunFinalVerdict } from '../components/RunFinalVerdict';
import { calculateDataQualityScore } from '../utils/dataQualityScore';
import { deriveTotalRecords } from '../utils/resultImpact';
import { buildValidationRunPdf } from '../utils/dataTestReportPdf';
import styles from './ExpectationRunDetailPage.module.css';

// Etapa 11 (docs/data-testing/etapa-11-rediseno-reporte-ejecucion.md):
// rediseño enterprise de la pantalla "Data Docs" (REQ-DT-011) — mismos
// datos que ya traía `run` (columnCoverage, results, overallStatus,
// durationMs, executedBy), presentados con jerarquía visual, lenguaje de
// negocio y resumen-antes-que-detalle. El PDF (Etapa 8, dataTestReportPdf.js)
// queda fuera de alcance a propósito y no se toca: `downloadPdf` sigue
// armando exactamente el mismo objeto `labels`.
export function ExpectationRunDetailPage() {
  const { t } = useTranslation();
  const { runId } = useParams();
  const [pdfError, setPdfError] = useState('');
  const [columnFilter, setColumnFilter] = useState('');

  const runQuery = useQuery({
    queryKey: ['validationRun', runId],
    queryFn: () => dataTestingApi.getRun(runId),
  });
  const run = runQuery.data?.validationRun;

  // ValidationRun no guarda el nombre de su Suite, solo `suiteId` — mismo
  // patrón que AutomationRunDetailPage resolviendo Suite/proyecto aparte.
  const suiteQuery = useQuery({
    queryKey: ['expectationSuite', run?.suiteId],
    queryFn: () => dataTestingApi.getSuite(run.suiteId),
    enabled: Boolean(run?.suiteId),
  });
  const suiteName = suiteQuery.data?.expectationSuite?.name || t('common.unknown');

  // Etapa 8 (docs/data-testing/etapa-8-pdf-reporte.md): `dataTestReportPdf.js`
  // se mantiene puro/agnóstico de idioma (mismo criterio que reportPdf.js) —
  // acá se arma el objeto `labels` con todo lo ya traducido vía i18next. Sin
  // cambios respecto de antes del rediseño de esta pantalla.
  function downloadPdf() {
    setPdfError('');
    try {
      const expectationLabels = Object.fromEntries(
        run.results.map((result) => [result.expId, t(`dataTesting.expectations.${result.expId}`)]),
      );
      const doc = buildValidationRunPdf({
        run,
        suiteName,
        labels: {
          reportTitle: t('dataTesting.runDetailTitle'),
          overallPassedLabel: t('dataTesting.status_passed'),
          overallFailedLabel: t('dataTesting.status_failed'),
          datasetLabel: t('dataTesting.datasetHeader'),
          executedAtLabel: t('dataTesting.executedAtHeader'),
          columnCoverageTitle: t('dataTesting.columnCoverageTitle'),
          expectedColumnHeader: t('dataTesting.expectedColumnHeader'),
          foundHeader: t('dataTesting.foundHeader'),
          foundYes: t('dataTesting.foundYes'),
          foundNo: t('dataTesting.foundNo'),
          resultsTitle: t('dataTesting.resultsTitle'),
          noResults: t('dataTesting.runsEmptyState'),
          tableLevelGroup: t('dataTesting.expectationSelector.tableExpectationsGroup'),
          statusPassed: t('dataTesting.status_passed'),
          statusFailed: t('dataTesting.status_failed'),
          successPercentLabel: t('dataTesting.successPercentHeader'),
          thresholdLabel: t('dataTesting.thresholdHeader'),
          actualLabel: t('dataTesting.actualValueLabel'),
          expectedLabel: t('dataTesting.expectedValueLabel'),
          failureSampleLabel: t('dataTesting.failureSampleHeader'),
          affectedRecordsLabel: t('dataTesting.affectedRecordsHeader'),
          expectations: expectationLabels,
        },
      });
      doc.save(`corrida-${run._id}.pdf`);
    } catch (error) {
      setPdfError(error.message || t('dataTesting.downloadPdfError'));
    }
  }

  const score = run ? calculateDataQualityScore(run.results) : null;
  const totalRecords = run ? deriveTotalRecords(run.results) : null;
  // Pedido directo del usuario: filtrar "Resultado por Expectativa" por
  // columna — sólo tiene sentido para resultados de scope column (Tabla no
  // tiene una columna propia, Multicolumna tiene varias), en orden de
  // primera aparición (mismo criterio que RunQualityCharts#qualityByColumn).
  const filterableColumns = run
    ? [...new Set(run.results.filter((result) => result.column).map((result) => result.column))]
    : [];
  const filteredResults =
    run && columnFilter ? run.results.filter((result) => result.column === columnFilter) : run?.results || [];

  return (
    <div>
      <PageHeader
        title={t('dataTesting.runDetailTitle')}
        leading={<BackButton />}
        action={
          run && (
            <Button variant="secondary" onClick={downloadPdf}>
              {t('dataTesting.downloadPdfButton')}
            </Button>
          )
        }
      />

      <Card>
        {runQuery.isLoading && <LoadingState />}
        {runQuery.isError && <ErrorState onRetry={runQuery.refetch} />}
        {!runQuery.isLoading && !runQuery.isError && run && (
          <div className={styles.metaBar}>
            <span>
              <span aria-hidden="true">📄</span> {t('dataTesting.datasetHeader')}: {run.datasetName}
            </span>
            <span>
              <span aria-hidden="true">📅</span> {t('dataTesting.executedAtHeader')}:{' '}
              {new Date(run.executedAt).toLocaleString()}
            </span>
            <StatusBadge
              status={run.overallStatus}
              label={t(`dataTesting.status_${run.overallStatus}`)}
            />
          </div>
        )}
        {pdfError && <p className={styles.pdfError}>{pdfError}</p>}
      </Card>

      {!runQuery.isLoading && !runQuery.isError && run && (
        <>
          <RunExecutiveSummary score={score} results={run.results} recordsProcessed={totalRecords} />

          <RunQualityCharts results={run.results} />

          <div className={styles.mainGrid}>
            <ColumnCoverageCard columnCoverage={run.columnCoverage} />

            <Card>
              <div className={styles.resultsHeader}>
                <h2 className={styles.blockTitle}>{t('dataTesting.resultsTitle')}</h2>
                <div className={styles.resultsHeaderActions}>
                  {filterableColumns.length > 0 && (
                    <select
                      className={styles.columnFilterSelect}
                      aria-label={t('dataTesting.filterByColumnLabel')}
                      value={columnFilter}
                      onChange={(event) => setColumnFilter(event.target.value)}
                    >
                      <option value="">{t('dataTesting.allColumnsOption')}</option>
                      {filterableColumns.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className={styles.resultsCount}>
                    {t('dataTesting.rulesCountLabel', { count: filteredResults.length })}
                  </span>
                </div>
              </div>
              <div className={styles.resultsList}>
                {filteredResults.map((result, index) => (
                  <RuleResultCard
                    key={`${result.expId}-${result.column || result.columns?.join('-') || index}`}
                    result={result}
                    totalRecords={totalRecords}
                    suiteSnapshot={run.suiteSnapshot}
                  />
                ))}
              </div>
            </Card>
          </div>

          <RunFinalVerdict
            columnCoverage={run.columnCoverage}
            results={run.results}
            overallStatus={run.overallStatus}
          />
        </>
      )}
    </div>
  );
}
