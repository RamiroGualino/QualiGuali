import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { automationRunsApi, postmanSuitesApi } from '../api/execution.api';
import { projectsApi } from '../api/projects.api';
import { PageHeader } from '../components/PageHeader';
import { BackButton } from '../components/BackButton';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { PostmanTestDrawerContent } from '../components/PostmanTestDrawerContent';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import { buildPostmanRunPdf } from '../utils/reportPdf';
import {
  buildPostmanRunReportData,
  buildPostmanRunHtml,
  sanitizeSuiteName,
} from '../utils/postmanRunReport';
import styles from './AutomationRunDetailPage.module.css';

// Etapa 5 (docs/postman-runner/etapa-5-sistema-de-reportes.md): the "vista
// de detalle de ejecución" the design doc calls for — a Postman Suite run's
// individual requests, each openable in a drawer for its full
// request/response/log detail, plus PDF/HTML export of the same data.
// Works for any AutomationRun (Allure runs just won't have method/url/
// request-response detail to show — those fields are always null for them,
// see AutomationTestResult's Etapa 4 comment), not only Postman ones.
function downloadHtmlFile(filename, htmlContent) {
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AutomationRunDetailPage() {
  const { t } = useTranslation();
  const { runId } = useParams();
  const [activeTestResult, setActiveTestResult] = useState(null);

  const runQuery = useQuery({
    queryKey: ['automationRun', runId],
    queryFn: () => automationRunsApi.get(runId),
  });
  const testsQuery = useQuery({
    queryKey: ['automationRunTests', runId],
    queryFn: () => automationRunsApi.listTests(runId),
  });

  const run = runQuery.data?.automationRun;
  const testResults = testsQuery.data?.testResults || [];
  const isLoading = runQuery.isLoading || testsQuery.isLoading;
  const isError = runQuery.isError || testsQuery.isError;

  // Resolved so the exported PDF/HTML title shows the real Suite name
  // instead of the tool name ("Newman") — a manually-uploaded report has no
  // Suite to look up, so this falls back to the collection's own name
  // (already on every testResult, see execution-service's newmanParser.js),
  // sanitized the same way buildPostmanRunHtml sanitizes its own meta.
  const suiteQuery = useQuery({
    queryKey: ['postmanSuite', run?.postmanSuiteId],
    queryFn: () => postmanSuitesApi.get(run.postmanSuiteId),
    enabled: Boolean(run?.postmanSuiteId),
  });
  const suite = suiteQuery.data?.postmanSuite;

  const projectQuery = useQuery({
    queryKey: ['project', run?.projectId],
    queryFn: () => projectsApi.get(run.projectId),
    enabled: Boolean(run?.projectId),
  });
  const project = projectQuery.data?.project;

  // Same client-side fetch-from-the-bucket pattern as AutomationPage's
  // EnvironmentCell — a Postman environment file has its own "name" field
  // (e.g. "Local", "Staging") that isn't stored anywhere in Mongo, only in
  // the file itself.
  const environmentQuery = useQuery({
    queryKey: ['postmanEnvironmentName', suite?.environmentFileUrl],
    queryFn: async () => {
      const response = await fetch(suite.environmentFileUrl);
      if (!response.ok) throw new Error(`Failed to fetch environment: ${response.status}`);
      const json = await response.json();
      return json.name || null;
    },
    enabled: Boolean(suite?.environmentFileUrl),
    staleTime: Infinity,
    retry: false,
  });

  const resolvedSuiteName = sanitizeSuiteName(
    suite?.name || testResults[0]?.suiteName,
    t('automation.unnamedCollection'),
  );

  const exportLabels = {
    reportTitle: t('automation.runReportTitle'),
    runTitle: run ? `${resolvedSuiteName} — ${new Date(run.executedAt).toLocaleString()}` : '',
    executedAt: t('reports.generatedAt'),
    truncatedNote: t('reports.truncatedNote'),
    statusBreakdown: t('reports.statusBreakdown'),
    totalTestCases: t('automation.totalTests'),
    passed: t('automation.passed'),
    failed: t('automation.failed'),
    broken: t('automation.broken'),
    skipped: t('automation.skipped'),
    caseSummaryTitle: t('reports.caseSummaryTitle'),
    caseDetailsTitle: t('reports.caseDetailsTitle'),
    testCase: t('executions.testCase'),
    method: t('automation.method'),
    status: t('common.status'),
    durationMs: t('automation.durationMs'),
    responseStatus: t('automation.responseStatus'),
    actualResult: t('executions.actualResult'),
    requestHeaders: t('automation.requestHeaders'),
    requestBody: t('automation.requestBody'),
    responseHeaders: t('automation.responseHeaders'),
    responseBody: t('automation.responseBody'),
    logs: t('automation.logs'),
    viewFullContent: t('automation.viewFullContent'),
    unnamedCollection: t('automation.unnamedCollection'),
    noEnvironment: t('automation.noEnvironment'),
    reportExecutionTitle: t('automation.reportExecutionTitle', { suiteName: '{{suiteName}}' }),
    generatedOnTrigger: t('automation.generatedOnTrigger', {
      date: '{{date}}',
      trigger: '{{trigger}}',
    }),
    exportedAsHtml: t('automation.exportedAsHtml'),
    requestsExecutedNav: t('automation.requestsExecutedNav'),
    environment: t('automation.environment'),
    generalResult: t('automation.generalResult'),
    passRateDuration: t('automation.passRateDuration', {
      rate: '{{rate}}',
      duration: '{{duration}}',
    }),
    showingAllRequests: t('automation.showingAllRequests', { count: '{{count}}' }),
    showingFilteredRequests: t('automation.showingFilteredRequests', {
      visible: '{{visible}}',
      total: '{{total}}',
      status: '{{status}}',
    }),
    viewAllRequests: t('automation.viewAllRequests'),
    statusPillPassed: t('automation.statusPillPassed'),
    statusPillFailed: t('automation.statusPillFailed'),
    statusPillBroken: t('automation.statusPillBroken'),
    statusPillSkipped: t('automation.statusPillSkipped'),
    footerBrand: t('automation.footerBrand'),
    requestsCountDuration: t('automation.requestsCountDuration', {
      count: '{{count}}',
      duration: '{{duration}}',
    }),
    triggerType_manual: t('automation.triggerType_manual'),
    triggerType_scheduled: t('automation.triggerType_scheduled'),
    triggerType_retry: t('automation.triggerType_retry'),
  };

  const exportMeta = {
    suiteName: resolvedSuiteName,
    projectName: project?.name || '—',
    environmentName: environmentQuery.data || null,
  };

  function exportPdf() {
    const data = buildPostmanRunReportData({ run, testResults, labels: exportLabels });
    const doc = buildPostmanRunPdf({ data, labels: exportLabels, meta: exportMeta });
    doc.save(`${run.tool}-run-${run._id}.pdf`);
  }

  function exportHtml() {
    const data = buildPostmanRunReportData({ run, testResults, labels: exportLabels });
    const html = buildPostmanRunHtml({ data, labels: exportLabels, meta: exportMeta });
    downloadHtmlFile(`${run.tool}-run-${run._id}.html`, html);
  }

  return (
    <div>
      <PageHeader
        title={t('automation.runDetailTitle')}
        leading={<BackButton />}
        action={
          run && (
            <div className={styles.actions}>
              <Button variant="secondary" onClick={exportHtml}>
                {t('automation.exportHtml')}
              </Button>
              <Button variant="secondary" onClick={exportPdf}>
                {t('automation.exportPdf')}
              </Button>
            </div>
          )
        }
      />

      <Card>
        {isLoading && <LoadingState />}
        {isError && (
          <ErrorState
            onRetry={() => {
              runQuery.refetch();
              testsQuery.refetch();
            }}
          />
        )}
        {!isLoading && !isError && run && (
          <div className={styles.summary}>
            <span>
              {t('automation.tool')}: {t(`automation.${run.tool}`)}
            </span>
            <span>
              {t('automation.totalTests')}: {run.totalTests}
            </span>
            <span>
              {t('automation.passed')}: {run.passed}
            </span>
            <span>
              {t('automation.failed')}: {run.failed}
            </span>
            {run.postmanSuiteId && (
              <span>
                {t('automation.triggerType')}: {t(`automation.triggerType_${run.triggerType}`)}
              </span>
            )}
          </div>
        )}
      </Card>

      <Card>
        {!isLoading && !isError && testResults.length === 0 && (
          <EmptyState message={t('automation.emptyState')} />
        )}
        {!isLoading && !isError && testResults.length > 0 && (
          <Table
            columns={[
              {
                key: 'testName',
                header: t('executions.testCase'),
                render: (row) =>
                  row.suiteName ? `${row.suiteName} — ${row.testName}` : row.testName,
              },
              { key: 'method', header: t('automation.method'), render: (row) => row.method || '—' },
              {
                key: 'status',
                header: t('common.status'),
                render: (row) => <StatusBadge status={row.status} label={row.status} />,
              },
              {
                key: 'durationMs',
                header: t('automation.durationMs'),
                render: (row) =>
                  row.durationMs === null || row.durationMs === undefined
                    ? '—'
                    : `${row.durationMs} ms`,
              },
            ]}
            rows={testResults}
            onRowClick={setActiveTestResult}
          />
        )}
      </Card>

      <Modal
        open={Boolean(activeTestResult)}
        title={activeTestResult ? activeTestResult.testName : ''}
        onClose={() => setActiveTestResult(null)}
        variant="drawer"
        drawerWidth="min(90vw, 46rem)"
      >
        {activeTestResult && <PostmanTestDrawerContent testResult={activeTestResult} />}
      </Modal>
    </div>
  );
}
