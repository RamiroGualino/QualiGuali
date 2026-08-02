import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { dataTestingApi } from '../api/dataTesting.api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { Tabs } from '../components/Tabs';
import { StatusBadge } from '../components/StatusBadge';
import { ValidationRunNewModal } from '../components/ValidationRunNewModal';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './ExpectationRunsPage.module.css';

const ALL_SUITES = '';

// Mismo criterio que ExpectationSuitesPage — ver el comentario ahí sobre por
// qué Suites/Corridas comparten una barra de Tabs.
function dataTestingTabs(t, projectId) {
  return [
    {
      key: 'suites',
      label: t('dataTesting.suitesTab'),
      to: `/projects/${projectId}/data-testing/suites`,
      end: true,
    },
    {
      key: 'runs',
      label: t('dataTesting.runsTab'),
      to: `/projects/${projectId}/data-testing/runs`,
      end: true,
    },
  ];
}

// Etapa 7 (docs/data-testing/etapa-7-frontend-corridas.md): historial de
// Corridas de Validación del proyecto activo, filtrable por Suite. Usa
// GET /validation-runs?projectId= — filtro agregado durante esta etapa
// (ver la Corrección en etapa-5-api-corridas.md), ya que el endpoint
// original sólo aceptaba ?suiteId.
export function ExpectationRunsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [suiteFilter, setSuiteFilter] = useState(ALL_SUITES);
  const [isNewRunOpen, setIsNewRunOpen] = useState(false);

  const suitesQuery = useQuery({
    queryKey: ['expectationSuites', projectId],
    queryFn: () => dataTestingApi.listSuites({ projectId }),
  });
  const suites = suitesQuery.data?.expectationSuites || [];
  const suiteById = new Map(suites.map((suite) => [suite._id, suite]));

  const runsQuery = useQuery({
    queryKey: ['validationRuns', projectId, suiteFilter],
    queryFn: () =>
      dataTestingApi.listRuns({ projectId, suiteId: suiteFilter || undefined }),
  });
  const runs = runsQuery.data?.validationRuns || [];

  function viewRun(run) {
    navigate(`/projects/${projectId}/data-testing/runs/${run._id}`);
  }

  function handleRunCreated() {
    queryClient.invalidateQueries({ queryKey: ['validationRuns', projectId] });
    setIsNewRunOpen(false);
  }

  const isLoading = suitesQuery.isLoading || runsQuery.isLoading;
  const isError = suitesQuery.isError || runsQuery.isError;

  return (
    <div>
      <PageHeader
        title={t('dataTesting.runsTitle')}
        action={
          <Button icon="+" onClick={() => setIsNewRunOpen(true)}>
            {t('dataTesting.newRunButton')}
          </Button>
        }
      />

      <Tabs items={dataTestingTabs(t, projectId)} />

      <Card>
        {isLoading && <LoadingState />}
        {isError && <ErrorState onRetry={() => { suitesQuery.refetch(); runsQuery.refetch(); }} />}
        {!isLoading && !isError && (
          <div className={styles.filters}>
            <Select
              label={t('dataTesting.filterBySuite')}
              value={suiteFilter}
              onChange={setSuiteFilter}
              options={[
                { value: ALL_SUITES, label: t('common.all') },
                ...suites.map((suite) => ({ value: suite._id, label: suite.name })),
              ]}
            />
          </div>
        )}
        {!isLoading && !isError && runs.length === 0 && (
          <EmptyState message={t('dataTesting.runsEmptyState')} />
        )}
        {!isLoading && !isError && runs.length > 0 && (
          <Table
            columns={[
              {
                key: 'suite',
                header: t('dataTesting.suiteHeader'),
                render: (row) => suiteById.get(row.suiteId)?.name || t('common.unknown'),
              },
              { key: 'datasetName', header: t('dataTesting.datasetHeader') },
              {
                key: 'executedAt',
                header: t('dataTesting.executedAtHeader'),
                render: (row) => new Date(row.executedAt).toLocaleString(),
              },
              {
                key: 'overallStatus',
                header: t('dataTesting.overallStatusHeader'),
                render: (row) => (
                  <StatusBadge
                    status={row.overallStatus}
                    label={t(`dataTesting.status_${row.overallStatus}`)}
                  />
                ),
              },
              {
                key: 'actions',
                header: t('common.actions'),
                render: (row) => (
                  <Button size="sm" onClick={() => viewRun(row)}>
                    {t('common.view')}
                  </Button>
                ),
              },
            ]}
            rows={runs}
          />
        )}
      </Card>

      <Modal
        open={isNewRunOpen}
        title={t('dataTesting.newRunTitle')}
        onClose={() => setIsNewRunOpen(false)}
        disableBackdropClose
      >
        <ValidationRunNewModal
          suites={suites}
          onCreated={handleRunCreated}
          onCancel={() => setIsNewRunOpen(false)}
        />
      </Modal>
    </div>
  );
}
