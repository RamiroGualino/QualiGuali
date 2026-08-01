import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationRunsApi, executionCyclesApi, postmanSuitesApi } from '../api/execution.api';
import { requirementsApi } from '../api/qaCore.api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { Table, rowStateClassName } from '../components/Table';
import { Tabs } from '../components/Tabs';
import { Dropzone } from '../components/Dropzone';
import { StatusBadge } from '../components/StatusBadge';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { TestResultsBar } from '../components/TestResultsBar';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './AutomationPage.module.css';

// UI/API sub-modules map onto the existing `tool` field on AutomationRun —
// Allure reports are UI/E2E runs, Newman (Postman) reports are API runs.
// No new backend concept: /execution/automation-runs already accepts
// ?tool= for filtering, so this is purely a frontend split.
const TOOL_BY_TAB = { ui: 'allure', api: 'newman' };

function activeTabFor(pathname) {
  return pathname.endsWith('/api') ? 'api' : 'ui';
}

// The API tab's "Entorno" column names *which* Postman environment a run
// pointed at, not just whether one existed — worth an actual fetch+parse of
// the environment JSON (same client-side fetch-from-the-bucket pattern
// reportPdf.js's loadImageForPdf already uses for evidence images), not
// just a yes/no flag. A standalone component (not a plain render() cell)
// because it needs its own useQuery — react-query dedupes automatically
// across every row that happens to share the same environment file.
function EnvironmentCell({ url }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['postmanEnvironmentName', url],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch environment: ${response.status}`);
      const json = await response.json();
      return json.name || null;
    },
    enabled: Boolean(url),
    staleTime: Infinity,
    retry: false,
  });

  if (!url) return t('automation.noEnvironment');
  if (query.isLoading) return '…';
  if (query.isError || !query.data) return t('automation.environmentUnnamed');
  return query.data;
}

export function AutomationPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const activeTab = activeTabFor(location.pathname);
  const activeTool = TOOL_BY_TAB[activeTab];

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [tool, setTool] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [failuresRun, setFailuresRun] = useState(null);
  // API tab only (see the filters row below) — client-side, same reasoning
  // as the tool/tab split: allRunsQuery already fetches every run for the
  // project, so there's no need for a second backend query per filter.
  const [suiteFilter, setSuiteFilter] = useState('');
  const [requirementFilter, setRequirementFilter] = useState('');

  // Unfiltered — used both to render the active tab's table and to compute
  // both tabs' counts for their badges, from a single request.
  const allRunsQuery = useQuery({
    queryKey: ['automationRuns', projectId],
    queryFn: () => automationRunsApi.list({ projectId }),
  });

  const cyclesQuery = useQuery({
    queryKey: ['executionCycles', projectId],
    queryFn: () => executionCyclesApi.list(projectId),
  });

  // Only the API tab's table needs Suite names/environments — Allure runs
  // never carry a postmanSuiteId, so there's nothing for this query to
  // answer on the UI tab.
  const suitesQuery = useQuery({
    queryKey: ['postmanSuites', projectId],
    queryFn: () => postmanSuitesApi.list({ projectId }),
    enabled: activeTool === 'newman',
  });
  const suitesById = new Map((suitesQuery.data?.postmanSuites || []).map((s) => [s._id, s]));

  // Same "API tab only" reasoning as suitesQuery above — used both for the
  // Requirement filter's options and to resolve each run's Suite back to
  // its Requirement (a run has no requirementId of its own, only its
  // Suite does).
  const requirementsQuery = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => requirementsApi.list(projectId),
    enabled: activeTool === 'newman',
  });
  const requirements = requirementsQuery.data?.requirements || [];

  const failuresQuery = useQuery({
    queryKey: ['automationRunTests', failuresRun?._id],
    queryFn: () => automationRunsApi.listTests(failuresRun._id, 'failed'),
    enabled: Boolean(failuresRun),
  });

  const uploadMutation = useMutation({
    mutationFn: () =>
      automationRunsApi.upload(files, {
        projectId,
        cycleId: cycleId || undefined,
        tool: tool || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationRuns', projectId] });
      setIsUploadOpen(false);
      setFiles([]);
      setTool('');
      setCycleId('');
      setUploadError('');
    },
    onError: (error) => setUploadError(error.message),
  });

  const allRuns = allRunsQuery.data?.automationRuns || [];
  // Suite/Requirement filters only apply on the API tab — a run has no
  // requirementId of its own, so that filter goes through its Suite
  // (suitesById), the same lookup the "Suite Ejecutada"/"Entorno" columns
  // already use. A manually-uploaded report (no postmanSuiteId) never
  // matches either filter once one is picked, same as it can't show a Suite
  // name in that column either.
  const runs = allRuns
    .filter((run) => run.tool === activeTool)
    .filter((run) => activeTab !== 'api' || !suiteFilter || run.postmanSuiteId === suiteFilter)
    .filter((run) => {
      if (activeTab !== 'api' || !requirementFilter) return true;
      const suite = run.postmanSuiteId ? suitesById.get(run.postmanSuiteId) : null;
      return suite?.requirementId === requirementFilter;
    });
  const cycles = cyclesQuery.data?.executionCycles || [];
  const failedTests = failuresQuery.data?.testResults || [];

  const tabs = [
    {
      key: 'ui',
      label: t('automation.uiTab'),
      to: `/projects/${projectId}/automation`,
      end: true,
      count: allRuns.filter((run) => run.tool === TOOL_BY_TAB.ui).length,
    },
    {
      key: 'api',
      label: t('automation.apiTab'),
      to: `/projects/${projectId}/automation/api`,
      end: true,
      count: allRuns.filter((run) => run.tool === TOOL_BY_TAB.api).length,
    },
    {
      key: 'suites',
      label: t('automation.suitesTab'),
      to: `/projects/${projectId}/automation/suites`,
      end: true,
    },
  ];

  // Unchanged from before this refactor — the Allure (UI) tab keeps its
  // original plain columns. "Suite Ejecutada"/"Entorno" are Postman-only
  // concepts (Allure runs never carry a postmanSuiteId), so restructuring
  // this table only makes sense for the API tab below.
  const uiColumns = [
    { key: 'tool', header: t('automation.tool') },
    { key: 'totalTests', header: t('automation.totalTests') },
    { key: 'passed', header: t('automation.passed') },
    { key: 'failed', header: t('automation.failed') },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) => (
        <div className={styles.actions}>
          <Link to={`/projects/${projectId}/automation/runs/${row._id}`}>
            {t('automation.viewDetails')}
          </Link>
          <Button variant="secondary" onClick={() => setFailuresRun(row)}>
            {t('automation.viewFailures')}
          </Button>
          <a href={row.rawReportUrl} target="_blank" rel="noreferrer">
            {t('automation.viewReport')}
          </a>
        </div>
      ),
    },
  ];

  const apiColumns = [
    {
      key: 'suite',
      header: t('automation.suiteExecuted'),
      render: (row) => {
        if (!row.postmanSuiteId) return t('automation.manualReport');
        const suite = suitesById.get(row.postmanSuiteId);
        return suite ? suite.name : t('automation.unknownSuite');
      },
    },
    {
      key: 'executedAt',
      header: t('automation.dateTime'),
      render: (row) => new Date(row.executedAt).toLocaleString(),
    },
    {
      key: 'environment',
      header: t('automation.environment'),
      render: (row) => {
        const suite = row.postmanSuiteId ? suitesById.get(row.postmanSuiteId) : null;
        return <EnvironmentCell url={suite?.environmentFileUrl || null} />;
      },
    },
    {
      key: 'results',
      header: t('automation.statusResults'),
      render: (row) => (
        <TestResultsBar
          passed={row.passed}
          failed={row.failed}
          broken={row.broken}
          skipped={row.skipped}
          total={row.totalTests}
        />
      ),
    },
    {
      key: 'actions',
      header: t('common.actions'),
      render: (row) => (
        <div className={styles.actions}>
          <Button
            size="sm"
            onClick={() => navigate(`/projects/${projectId}/automation/runs/${row._id}`)}
          >
            {t('automation.viewDetails')}
          </Button>
          <RowActionsMenu
            actions={[
              { label: t('automation.viewFailures'), onClick: () => setFailuresRun(row) },
              {
                label: t('automation.viewReport'),
                onClick: () => window.open(row.rawReportUrl, '_blank', 'noreferrer'),
              },
            ]}
          />
        </div>
      ),
    },
  ];

  // Fail-fast row scan: a permanent colored left edge instead of having to
  // read the Estado/Resultados cell text on every row to spot a problem
  // one. Broken counts as a failure here too, same reasoning as
  // TestResultsBar folding it into the red segment.
  function getRowClassName(row) {
    if (row.failed > 0 || row.broken > 0) return rowStateClassName('failed');
    if (row.passed > 0) return rowStateClassName('passed');
    return undefined;
  }

  return (
    <div>
      <PageHeader
        title={t('automation.title')}
        action={
          <Button
            icon="+"
            onClick={() => {
              setTool(activeTool);
              setIsUploadOpen(true);
            }}
          >
            {t('automation.uploadButton')}
          </Button>
        }
      />

      <Tabs items={tabs} />

      <Card>
        {allRunsQuery.isLoading && <LoadingState />}
        {allRunsQuery.isError && <ErrorState onRetry={allRunsQuery.refetch} />}
        {!allRunsQuery.isLoading && !allRunsQuery.isError && activeTab === 'api' && (
          <div className={styles.filters}>
            <Select
              label={t('automation.filterBySuite')}
              value={suiteFilter}
              onChange={setSuiteFilter}
              options={[
                { value: '', label: t('common.all') },
                ...(suitesQuery.data?.postmanSuites || []).map((suite) => ({
                  value: suite._id,
                  label: suite.name,
                })),
              ]}
            />
            <Select
              label={t('requirements.title')}
              value={requirementFilter}
              onChange={setRequirementFilter}
              options={[
                { value: '', label: t('common.all') },
                ...requirements.map((req) => ({ value: req._id, label: req.title })),
              ]}
            />
          </div>
        )}
        {!allRunsQuery.isLoading && !allRunsQuery.isError && runs.length === 0 && (
          <EmptyState message={t('automation.emptyState')} />
        )}
        {!allRunsQuery.isLoading && !allRunsQuery.isError && runs.length > 0 && (
          <Table
            columns={activeTab === 'api' ? apiColumns : uiColumns}
            rows={runs}
            getRowClassName={activeTab === 'api' ? getRowClassName : undefined}
          />
        )}
      </Card>

      <Modal
        open={isUploadOpen}
        title={t('automation.uploadTitle')}
        onClose={() => setIsUploadOpen(false)}
      >
        <Select
          label={t('automation.tool')}
          value={tool}
          onChange={setTool}
          options={[
            { value: '', label: t('automation.toolAuto') },
            { value: 'allure', label: t('automation.allure') },
            { value: 'newman', label: t('automation.newman') },
          ]}
        />
        <Select
          label={t('automation.cycleOptional')}
          value={cycleId}
          onChange={setCycleId}
          options={[
            { value: '', label: t('common.none') },
            ...cycles.map((cycle) => ({ value: cycle._id, label: cycle.name })),
          ]}
        />
        <Dropzone
          multiple
          hint={t('automation.dropHint')}
          onFiles={(list) => setFiles(Array.from(list))}
        />
        {files.length > 0 && (
          <p className={styles.fileList}>{files.map((file) => file.name).join(', ')}</p>
        )}
        {uploadError && <p className={styles.error}>{uploadError}</p>}
        <Button
          disabled={files.length === 0 || uploadMutation.isPending}
          onClick={() => uploadMutation.mutate()}
        >
          {t('common.save')}
        </Button>
      </Modal>

      <Modal
        open={Boolean(failuresRun)}
        title={t('automation.viewFailures')}
        onClose={() => setFailuresRun(null)}
      >
        {failuresQuery.isLoading && <LoadingState />}
        {!failuresQuery.isLoading && failedTests.length === 0 && (
          <EmptyState message={t('reports.noFailures')} />
        )}
        {!failuresQuery.isLoading && failedTests.length > 0 && (
          <ul className={styles.failuresList}>
            {failedTests.map((testResult) => (
              <li key={testResult._id}>
                <StatusBadge status={testResult.status} label={testResult.status} />{' '}
                {testResult.suiteName} — {testResult.testName}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
