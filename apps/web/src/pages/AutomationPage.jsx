import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { automationRunsApi, executionCyclesApi } from '../api/execution.api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { Tabs } from '../components/Tabs';
import { Dropzone } from '../components/Dropzone';
import { StatusBadge } from '../components/StatusBadge';
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

export function AutomationPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const activeTab = activeTabFor(location.pathname);
  const activeTool = TOOL_BY_TAB[activeTab];

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [tool, setTool] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [failuresRun, setFailuresRun] = useState(null);

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
  const runs = allRuns.filter((run) => run.tool === activeTool);
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
  ];

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
        {!allRunsQuery.isLoading && !allRunsQuery.isError && runs.length === 0 && (
          <EmptyState message={t('automation.emptyState')} />
        )}
        {!allRunsQuery.isLoading && !allRunsQuery.isError && runs.length > 0 && (
          <Table
            columns={[
              { key: 'tool', header: t('automation.tool') },
              { key: 'totalTests', header: t('automation.totalTests') },
              { key: 'passed', header: t('automation.passed') },
              { key: 'failed', header: t('automation.failed') },
              {
                key: 'actions',
                header: t('common.actions'),
                render: (row) => (
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => setFailuresRun(row)}>
                      {t('automation.viewFailures')}
                    </Button>
                    <a href={row.rawReportUrl} target="_blank" rel="noreferrer">
                      {t('automation.viewReport')}
                    </a>
                  </div>
                ),
              },
            ]}
            rows={runs}
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
