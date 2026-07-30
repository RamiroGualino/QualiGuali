import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { reportsApi } from '../api/reports.api';
import { executionCyclesApi, executionsApi } from '../api/execution.api';
import { testCasesApi } from '../api/qaCore.api';
import { usersApi } from '../api/users.api';
import { defectsApi } from '../api/defects.api';
import { useSearchAndPaginate } from '../hooks/useSearchAndPaginate';
import { codeNumber, countsFor, formatCaseLabel } from '../utils/executions';
import { generateCycleReportPdf, loadImageForPdf } from '../utils/reportPdf';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { TextField } from '../components/TextField';
import { KpiCard } from '../components/KpiCard';
import { Table } from '../components/Table';
import { SearchBar } from '../components/SearchBar';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { ResultsBar } from '../components/ResultsBar';
import { ExecutionDrawerContent } from '../components/ExecutionDrawerContent';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './ReportsDashboardPage.module.css';

const FAILURE_ORIGINS = ['manual', 'allure', 'newman'];
const TREND_ORIGINS = ['manual', 'allure', 'newman', 'combined'];
const SEARCH_FIELDS = ['code', 'title'];
const EMPTY_ARRAY = [];

export function ReportsDashboardPage() {
  const { t } = useTranslation();
  const { projectId, cycleId: routeCycleId } = useParams();
  const navigate = useNavigate();

  const [origin, setOrigin] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [trendOrigin, setTrendOrigin] = useState('combined');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [activeIndex, setActiveIndex] = useState(null);
  const [isExporting, setIsExporting] = useState(false);

  const cyclesQuery = useQuery({
    queryKey: ['executionCycles', projectId],
    queryFn: () => executionCyclesApi.list(projectId),
  });

  const cycleId = routeCycleId || '';

  // Ground-truth execution status, straight from execution-service — the
  // report-generated CycleReport read-model has already proven fragile to
  // lost domain events, so the interactive status browser below is built
  // directly on the same data ExecutionCycleDetailPage uses.
  const executionsQuery = useQuery({
    queryKey: ['executions', cycleId],
    queryFn: () => executionCyclesApi.listExecutions(cycleId),
    enabled: Boolean(cycleId),
  });

  const testCasesQuery = useQuery({
    queryKey: ['testCases', projectId],
    queryFn: () => testCasesApi.list({ projectId }),
    enabled: Boolean(cycleId),
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    retry: false,
  });

  const failuresQuery = useQuery({
    queryKey: ['cycleFailures', cycleId, origin, moduleFilter],
    queryFn: () => reportsApi.getCycleFailures(cycleId, { origin, module: moduleFilter }),
    enabled: Boolean(cycleId),
  });

  const trendQuery = useQuery({
    queryKey: ['trend', projectId, trendOrigin, from, to],
    queryFn: () => reportsApi.getProjectTrend(projectId, { origin: trendOrigin, from, to }),
  });

  const cycles = cyclesQuery.data?.executionCycles || [];
  const executions = executionsQuery.data?.executions || EMPTY_ARRAY;
  const testCaseById = Object.fromEntries(
    (testCasesQuery.data?.testCases || []).map((testCase) => [testCase._id, testCase]),
  );
  const userNameById = Object.fromEntries(
    (usersQuery.data?.users || []).map((user) => [user._id, user.name]),
  );
  const failures = failuresQuery.data?.failures || [];
  const trend = (trendQuery.data?.trend || []).map((point) => ({
    date: new Date(point.date).toLocaleDateString(),
    passRate: point.passRate !== null ? Math.round(point.passRate * 100) : null,
  }));

  const rows = [...executions]
    .map((execution) => {
      const testCase = testCaseById[execution.testCaseId];
      return { ...execution, code: testCase?.code || '', title: testCase?.title || '', testCase };
    })
    .sort((a, b) => codeNumber(a.code) - codeNumber(b.code));

  const kpis = countsFor(executions);
  const kpiTotal = executions.length;

  const filteredRows =
    selectedStatus === 'all' ? rows : rows.filter((row) => row.status === selectedStatus);

  const {
    search,
    onSearchChange,
    page,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    pageItems,
  } = useSearchAndPaginate(filteredRows, SEARCH_FIELDS);

  const activeRow = activeIndex !== null ? filteredRows[activeIndex] : null;

  function openExecution(row) {
    setActiveIndex(filteredRows.findIndex((candidate) => candidate._id === row._id));
  }

  function navigateExecution(direction) {
    setActiveIndex((current) => {
      const next = current + direction;
      return next >= 0 && next < filteredRows.length ? next : current;
    });
  }

  function selectStatus(value) {
    setSelectedStatus(value);
    setActiveIndex(null);
  }

  // Resolves everything a per-case PDF section needs beyond what `rows`
  // already carries: execution history, evidence (images fetched and
  // inlined as data URLs; video/other left as a note, PDFs can't embed
  // them), and — for failed cases — linked defects. One case's fetch
  // failing (evidence deleted, network hiccup) shouldn't sink the whole
  // export, so each is best-effort.
  async function buildPdfCases() {
    return Promise.all(
      rows.map(async (row) => {
        const [historyResult, evidenceResult] = await Promise.all([
          executionsApi.listHistory(row._id).catch(() => ({ history: [] })),
          executionsApi.listEvidence(row._id).catch(() => ({ evidence: [] })),
        ]);
        const fetchedHistory = historyResult.history || [];
        const hasRealHistory = fetchedHistory.length > 0;
        const history =
          !hasRealHistory && row.status !== 'not_executed'
            ? [
                {
                  _id: 'legacy',
                  status: row.status,
                  comments: row.comments,
                  executedBy: row.executedBy,
                  executedAt: row.executedAt,
                },
              ]
            : fetchedHistory;

        const evidence = evidenceResult.evidence || [];
        // Same executionHistoryId linking the on-screen drawer already
        // uses — each attempt only shows the evidence uploaded for IT, not
        // a screenshot from some other attempt. Executions predating
        // history tracking (no real ExecutionHistory rows) only ever had
        // one attempt, so all of that execution's evidence belongs to it.
        const evidenceByHistoryId = {};
        if (hasRealHistory) {
          evidence.forEach((item) => {
            if (!item.executionHistoryId) return;
            evidenceByHistoryId[item.executionHistoryId] ||= [];
            evidenceByHistoryId[item.executionHistoryId].push(item);
          });
        } else if (history.length > 0) {
          evidenceByHistoryId.legacy = evidence;
        }

        const historyWithEvidence = await Promise.all(
          history.map(async (entry) => {
            const entryEvidence = evidenceByHistoryId[entry._id] || [];
            const entryImages = entryEvidence.filter((item) => item.fileType === 'image');
            const images = (
              await Promise.all(
                entryImages.map((item) => loadImageForPdf(item.fileUrl).catch(() => null)),
              )
            ).filter(Boolean);
            return {
              status: entry.status,
              statusLabel: t(`executions.status_${entry.status}`),
              comments: entry.comments,
              testedBy: userNameById[entry.executedBy] || entry.executedBy || '—',
              executedAt: entry.executedAt,
              images,
              otherEvidenceCount: entryEvidence.length - entryImages.length,
            };
          }),
        );

        let defects = [];
        if (row.status === 'fail') {
          const defectsResult = await defectsApi
            .list({ projectId, linkedExecutionId: row._id })
            .catch(() => ({ defects: [] }));
          defects = defectsResult.defects || [];
        }

        return {
          testCaseId: row.testCase?.testCaseId,
          title: row.title,
          status: row.status,
          statusLabel: t(`executions.status_${row.status}`),
          priorityLabel: row.testCase ? t(`requirements.priority_${row.testCase.priority}`) : '—',
          testingTypeLabel: row.testCase
            ? t(`testCases.testingType_${row.testCase.testingType}`)
            : '—',
          executionTypeLabel: row.testCase
            ? t(`testCases.executionType_${row.testCase.executionType}`)
            : '—',
          assignee: row.testCase?.assignee,
          estimatedTime: row.testCase?.estimatedTime,
          preconditions: row.testCase?.preconditions,
          steps: row.testCase?.steps || [],
          expectedResult: row.testCase?.expectedResult,
          postconditions: row.testCase?.postconditions,
          createdAt: row.testCase?.createdAt,
          history: historyWithEvidence,
          defects: defects.map((defect) => ({
            code: defect.code,
            title: defect.title,
            severityLabel: t(`defects.severity_${defect.severity}`),
            statusLabel: t(`defects.status_${defect.status}`),
          })),
        };
      }),
    );
  }

  // A native, structured PDF (tables + drawn shapes, generated by
  // reportPdf.js) rather than a screenshot of the page — legible, reads
  // like a real report, and shows every test case's full detail.
  async function downloadPdf() {
    setIsExporting(true);
    try {
      const cases = await buildPdfCases();
      const cycleName = cycles.find((cycle) => cycle._id === cycleId)?.name || 'report';
      const doc = generateCycleReportPdf({
        cycleName,
        generatedAt: new Date(),
        kpis: { total: kpiTotal, ...kpis },
        cases,
        failures,
        labels: {
          reportTitle: t('reports.title'),
          generatedAt: t('reports.generatedAt'),
          truncatedNote: t('reports.truncatedNote'),
          history: t('executions.history'),
          statusBreakdown: t('reports.statusBreakdown'),
          totalTestCases: t('executions.totalTestCasesKpi'),
          passed: t('executions.passedKpi'),
          failed: t('executions.failedKpi'),
          blocked: t('executions.blockedKpi'),
          notRun: t('executions.notRunKpi'),
          caseSummaryTitle: t('reports.caseSummaryTitle'),
          caseDetailsTitle: t('reports.caseDetailsTitle'),
          testCase: t('executions.testCase'),
          testCaseId: t('testCases.testCaseId'),
          status: t('common.status'),
          priority: t('requirements.priority'),
          createdAt: t('common.createdAt'),
          testingType: t('testCases.testingType'),
          executionType: t('testCases.executionType'),
          assignee: t('testCases.assignee'),
          estimatedTime: t('testCases.estimatedTime'),
          preconditions: t('testCases.preconditions'),
          steps: t('testCases.steps'),
          expectedResult: t('testCases.sectionExpectedResult'),
          postconditions: t('testCases.postconditions'),
          actualResult: t('executions.actualResult'),
          testedBy: t('executions.testedBy'),
          evidence: t('executions.evidence'),
          noEvidence: t('executions.noEvidence'),
          nonImageEvidenceNote: t('reports.nonImageEvidenceNote'),
          relatedDefects: t('reports.relatedDefects'),
          noRelatedDefects: t('reports.noRelatedDefects'),
          passRate: t('reports.passRate'),
          failuresTitle: t('reports.failuresTitle'),
          linkedDefect: t('reports.linkedDefect'),
          origin: t('reports.filterOrigin'),
        },
      });
      doc.save(`${cycleName}.pdf`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('reports.title')}
        action={
          cycleId &&
          executions.length > 0 && (
            <span className={styles.printHide}>
              <Button variant="secondary" onClick={downloadPdf} disabled={isExporting}>
                {isExporting ? t('reports.generatingPdf') : t('reports.downloadPdf')}
              </Button>
            </span>
          )
        }
      />

      <Card className={[styles.section, styles.printHide].join(' ')}>
        <Select
          label={t('reports.selectCycle')}
          value={cycleId}
          onChange={(value) => navigate(`/projects/${projectId}/reports/${value}`)}
          options={[
            { value: '', label: t('reports.selectCycle') },
            ...cycles.map((cycle) => ({ value: cycle._id, label: cycle.name })),
          ]}
        />
      </Card>

      <>
        {cycleId && executions.length > 0 && (
          <Card className={styles.printTitle}>
            <h2>{cycles.find((cycle) => cycle._id === cycleId)?.name}</h2>
            <p className={styles.hint}>{new Date().toLocaleString()}</p>
          </Card>
        )}

        {cycleId && executionsQuery.isLoading && <LoadingState />}
        {cycleId && executionsQuery.isError && <ErrorState onRetry={executionsQuery.refetch} />}
        {cycleId &&
          !executionsQuery.isLoading &&
          !executionsQuery.isError &&
          executions.length === 0 && (
            <Card className={styles.section}>
              <EmptyState message={t('reports.noReportYet')} />
            </Card>
          )}

        {cycleId && executions.length > 0 && (
          <Card className={styles.section}>
            <p className={styles.sectionLabel}>{t('reports.statusBreakdown')}</p>
            <div className={styles.kpiGrid}>
              <KpiCard label={t('executions.totalTestCasesKpi')} value={kpiTotal} accent="info" />
              <KpiCard
                label={t('executions.passedKpi')}
                value={kpis.pass}
                accent="pass"
                tone="pass"
              />
              <KpiCard
                label={t('executions.failedKpi')}
                value={kpis.fail}
                accent="fail"
                tone="fail"
              />
              <KpiCard label={t('executions.blockedKpi')} value={kpis.blocked} accent="warning" />
              <KpiCard
                label={t('executions.notRunKpi')}
                value={kpis.notExecuted}
                accent="warning"
              />
            </div>
            <ResultsBar
              counts={kpis}
              interactive
              selectedStatus={selectedStatus}
              onSelectStatus={selectStatus}
            />
          </Card>
        )}

        {cycleId && executions.length > 0 && (
          <Card className={styles.section}>
            <div className={styles.printHide}>
              <SearchBar
                value={search}
                onChange={onSearchChange}
                placeholder={t('executions.searchTestCases')}
              />
            </div>
            {pageItems.length === 0 && <EmptyState message={t('common.noResults')} />}
            {pageItems.length > 0 && (
              <Table
                columns={[
                  {
                    key: 'testCaseExternalId',
                    header: t('testCases.testCaseId'),
                    render: (row) => row.testCase?.testCaseId || '—',
                  },
                  {
                    key: 'testCase',
                    header: t('executions.testCase'),
                    // Plain text, not ExpandableText — the whole row is
                    // already clickable (onRowClick opens the execution
                    // drawer below), so a second, nested click target on
                    // just the title popping up a separate "view full
                    // text" window is redundant, not helpful. Just the
                    // title — the app's internal code is never shown; its
                    // own Test Case ID already has the column to its left.
                    render: (row) => row.title || row.testCaseId,
                  },
                  {
                    key: 'status',
                    header: t('common.status'),
                    render: (row) => (
                      <StatusBadge
                        status={row.status}
                        label={t(`executions.status_${row.status}`)}
                      />
                    ),
                  },
                  {
                    key: 'priority',
                    header: t('requirements.priority'),
                    render: (row) =>
                      row.testCase ? (
                        <StatusBadge
                          status={row.testCase.priority}
                          label={t(`requirements.priority_${row.testCase.priority}`)}
                        />
                      ) : (
                        '—'
                      ),
                  },
                  {
                    key: 'createdAt',
                    header: t('common.createdAt'),
                    render: (row) => new Date(row.createdAt).toLocaleDateString(),
                  },
                ]}
                rows={pageItems}
                onRowClick={openExecution}
              />
            )}
            <div className={styles.printHide}>
              <Pagination
                page={page}
                pageSize={pageSize}
                totalItems={totalItems}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </div>
          </Card>
        )}

        <Card className={styles.section}>
          <div className={styles.trendHeader}>
            <p className={styles.sectionLabel}>{t('reports.trendTitle')}</p>
            <div className={[styles.filters, styles.printHide].join(' ')}>
              <Select
                label={t('reports.trendOrigin')}
                value={trendOrigin}
                onChange={setTrendOrigin}
                options={TREND_ORIGINS.map((value) => ({
                  value,
                  label: t(`reports.trendOrigin_${value}`),
                }))}
              />
              <TextField label={t('reports.from')} type="date" value={from} onChange={setFrom} />
              <TextField label={t('reports.to')} type="date" value={to} onChange={setTo} />
            </div>
          </div>
          {trendQuery.isLoading && <LoadingState />}
          {!trendQuery.isLoading && trend.length === 0 && (
            <EmptyState message={t('reports.noFailures')} />
          )}
          {!trendQuery.isLoading && trend.length > 0 && (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis unit="%" domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="passRate"
                  name={t('reports.passRate')}
                  stroke="#3fa66c"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {cycleId && (
          <Card>
            <div className={styles.trendHeader}>
              <p className={styles.sectionLabel}>{t('reports.failuresTitle')}</p>
              <div className={[styles.filters, styles.printHide].join(' ')}>
                <Select
                  label={t('reports.filterOrigin')}
                  value={origin}
                  onChange={setOrigin}
                  options={[
                    { value: '', label: t('reports.trendOriginAll') },
                    ...FAILURE_ORIGINS.map((value) => ({
                      value,
                      label: t(`reports.trendOrigin_${value}`),
                    })),
                  ]}
                />
                <TextField
                  label={t('reports.filterModule')}
                  value={moduleFilter}
                  onChange={setModuleFilter}
                />
              </div>
            </div>

            {failuresQuery.isLoading && <LoadingState />}
            {!failuresQuery.isLoading && failures.length === 0 && (
              <EmptyState message={t('reports.noFailures')} />
            )}
            {!failuresQuery.isLoading && failures.length > 0 && (
              <Table
                columns={[
                  { key: 'origin', header: t('reports.filterOrigin') },
                  { key: 'testName', header: t('testCases.titleField') },
                  {
                    key: 'status',
                    header: t('common.status'),
                    render: (row) => <StatusBadge status={row.status} label={row.status} />,
                  },
                  {
                    key: 'linkedDefect',
                    header: t('reports.linkedDefect'),
                    render: (row) => (row.linkedDefect ? row.linkedDefect.code : '—'),
                  },
                  {
                    key: 'link',
                    header: t('reports.viewEvidence'),
                    render: (row) => {
                      if (row.origin === 'manual') {
                        const first = row.evidence?.[0];
                        return first ? (
                          <a href={first.fileUrl} target="_blank" rel="noreferrer">
                            {t('reports.viewEvidence')}
                          </a>
                        ) : (
                          t('executions.noEvidence')
                        );
                      }
                      return row.rawReportUrl ? (
                        <a href={row.rawReportUrl} target="_blank" rel="noreferrer">
                          {t('reports.viewRawReport')}
                        </a>
                      ) : (
                        '—'
                      );
                    },
                  },
                ]}
                rows={failures}
                getRowKey={(row) => `${row.origin}-${row.sourceId}`}
              />
            )}
          </Card>
        )}
      </>

      <Modal
        open={activeRow !== null}
        title={activeRow ? formatCaseLabel(activeRow.testCase?.testCaseId, activeRow.title) : ''}
        onClose={() => setActiveIndex(null)}
        variant="drawer"
        drawerWidth="min(90vw, 46rem)"
      >
        {activeRow && (
          <ExecutionDrawerContent
            key={activeRow._id}
            execution={activeRow}
            testCase={activeRow.testCase}
            projectId={projectId}
            cycleId={cycleId}
            userNameById={userNameById}
            onNavigate={navigateExecution}
            hasPrev={activeIndex > 0}
            hasNext={activeIndex < filteredRows.length - 1}
            readOnly
          />
        )}
      </Modal>
    </div>
  );
}
