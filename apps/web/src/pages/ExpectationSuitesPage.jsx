import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataTestingApi } from '../api/dataTesting.api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ConfirmModal } from '../components/ConfirmModal';
import { Table } from '../components/Table';
import { Tabs } from '../components/Tabs';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './ExpectationSuitesPage.module.css';

// Etapa 6 (docs/data-testing/etapa-6-frontend-suites.md): listado de Suites
// de Expectativas del proyecto activo. A diferencia de PostmanSuitesPage/
// TestSuitesPage (que crean vía Modal sobre este mismo listado),
// ExpectationSuiteFormPage es una página separada — el formulario
// (ExpectationSelector incluido) es demasiado grande para un Modal.
//
// Etapa 9: Suites/Corridas comparten una barra de Tabs (mismo patrón que
// AutomationPage/PostmanSuitesPage con UI/API/Suites de Postman) — dos
// pantallas distintas del mismo módulo "Test de Datos", no un modal sobre
// la otra.
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

export function ExpectationSuitesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deletingSuite, setDeletingSuite] = useState(null);

  const suitesQuery = useQuery({
    queryKey: ['expectationSuites', projectId],
    queryFn: () => dataTestingApi.listSuites({ projectId }),
  });
  const suites = suitesQuery.data?.expectationSuites || [];

  const removeMutation = useMutation({
    mutationFn: () => dataTestingApi.deleteSuite(deletingSuite._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expectationSuites', projectId] });
      setDeletingSuite(null);
    },
  });

  function editSuite(suite) {
    navigate(`/projects/${projectId}/data-testing/suites/${suite._id}`);
  }

  return (
    <div>
      <PageHeader
        title={t('dataTesting.suitesTitle')}
        action={
          <Button
            icon="+"
            onClick={() => navigate(`/projects/${projectId}/data-testing/suites/new`)}
          >
            {t('dataTesting.newSuiteButton')}
          </Button>
        }
      />

      <Tabs items={dataTestingTabs(t, projectId)} />

      <Card>
        {suitesQuery.isLoading && <LoadingState />}
        {suitesQuery.isError && <ErrorState onRetry={suitesQuery.refetch} />}
        {!suitesQuery.isLoading && !suitesQuery.isError && suites.length === 0 && (
          <EmptyState message={t('dataTesting.emptyState')} />
        )}
        {!suitesQuery.isLoading && !suitesQuery.isError && suites.length > 0 && (
          <Table
            columns={[
              {
                key: 'name',
                header: t('dataTesting.name'),
                render: (row) => (
                  <button
                    type="button"
                    className={styles.nameLink}
                    onClick={() => editSuite(row)}
                  >
                    {row.name}
                  </button>
                ),
              },
              {
                key: 'expectations',
                header: t('dataTesting.expectationCountHeader'),
                render: (row) => row.expectations.length,
              },
              {
                key: 'version',
                header: t('dataTesting.collectionVersionHeader'),
                render: (row) => `v${row.version}`,
              },
              {
                key: 'actions',
                header: t('common.actions'),
                render: (row) => (
                  <RowActionsMenu
                    actions={[
                      { label: t('common.edit'), onClick: () => editSuite(row) },
                      {
                        label: t('common.delete'),
                        danger: true,
                        onClick: () => setDeletingSuite(row),
                      },
                    ]}
                  />
                ),
              },
            ]}
            rows={suites}
          />
        )}
      </Card>

      <ConfirmModal
        open={Boolean(deletingSuite)}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        onCancel={() => setDeletingSuite(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />
    </div>
  );
}
