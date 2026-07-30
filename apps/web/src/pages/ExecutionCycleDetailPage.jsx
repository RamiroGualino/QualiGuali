import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { executionCyclesApi } from '../api/execution.api';
import { testPlansApi, testSuitesApi, testCasesApi } from '../api/qaCore.api';
import { usersApi } from '../api/users.api';
import { useSearchAndPaginate } from '../hooks/useSearchAndPaginate';
import { codeNumber, countsFor, formatCaseLabel } from '../utils/executions';
import { PageHeader } from '../components/PageHeader';
import { BackButton } from '../components/BackButton';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { SearchBar } from '../components/SearchBar';
import { Pagination } from '../components/Pagination';
import { KpiCard } from '../components/KpiCard';
import { StatusBadge } from '../components/StatusBadge';
import { ResultsBar } from '../components/ResultsBar';
import { ExecutionDrawerContent } from '../components/ExecutionDrawerContent';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './ExecutionCycleDetailPage.module.css';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const SEARCH_FIELDS = ['code', 'title'];
// Stable reference so the `|| []` fallback doesn't invalidate memoized
// values on every render.
const EMPTY_ARRAY = [];

function toDateInputValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

export function ExecutionCycleDetailPage() {
  const { t } = useTranslation();
  const { projectId, cycleId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [force, setForce] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [activeIndex, setActiveIndex] = useState(null);
  // The execution drawer's sticky footer DOM node — ExecutionDrawerContent
  // portals its four quick-action buttons into it, same as the cycles
  // list's quick-execution modal, so executing a single case from this
  // page's row-level play button looks and behaves identically to that.
  const [footerNode, setFooterNode] = useState(null);
  // Separate from activeIndex — clicking the test case name opens a
  // read-only side drawer to review the case (no result-recording UI),
  // while the ▶ button opens the centered quick-execution dialog above.
  const [viewIndex, setViewIndex] = useState(null);

  const cycleQuery = useQuery({
    queryKey: ['executionCycle', cycleId],
    queryFn: () => executionCyclesApi.get(cycleId),
  });

  const executionsQuery = useQuery({
    queryKey: ['executions', cycleId],
    queryFn: () => executionCyclesApi.listExecutions(cycleId),
  });

  const cycle = cycleQuery.data?.executionCycle;

  const testPlanQuery = useQuery({
    queryKey: ['testPlan', cycle?.testPlanId],
    queryFn: () => testPlansApi.get(cycle.testPlanId),
    enabled: Boolean(cycle?.testPlanId),
  });

  const testSuiteQuery = useQuery({
    queryKey: ['testSuite', cycle?.suiteId],
    queryFn: () => testSuitesApi.get(cycle.suiteId),
    enabled: Boolean(cycle?.suiteId),
  });

  // Executions only carry a testCaseId — resolved here against the
  // project's test cases so each row can show "TC-006: Crear proyecto"
  // instead of a raw ObjectId.
  const testCasesQuery = useQuery({
    queryKey: ['testCases', projectId],
    queryFn: () => testCasesApi.list({ projectId }),
  });

  // Best-effort enrichment for "Tested by": executedBy is a userId, and
  // GET /users is Super-Admin only — a non-Super-Admin viewer just falls
  // back to showing the raw id below, nothing breaks.
  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
    retry: false,
  });

  const closeMutation = useMutation({
    mutationFn: () => executionCyclesApi.close(cycleId, force),
    onSuccess: () => {
      setCloseError('');
      queryClient.invalidateQueries({ queryKey: ['executionCycle', cycleId] });
    },
    onError: (error) => setCloseError(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      executionCyclesApi.update(cycleId, {
        name: editForm.name,
        description: editForm.description,
        assignee: editForm.assignee || null,
        startDate: editForm.startDate || null,
        endDate: editForm.endDate || null,
        priority: editForm.priority,
        status: editForm.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executionCycle', cycleId] });
      setIsEditOpen(false);
    },
  });

  function openEdit() {
    setEditForm({
      name: cycle.name,
      description: cycle.description || '',
      assignee: cycle.assignee || '',
      startDate: toDateInputValue(cycle.startDate),
      endDate: toDateInputValue(cycle.endDate),
      priority: cycle.priority || 'medium',
      status: cycle.status === 'closed' ? 'planned' : cycle.status,
    });
    setIsEditOpen(true);
  }

  const executions = executionsQuery.data?.executions || EMPTY_ARRAY;
  const testPlan = testPlanQuery.data?.testPlan;
  const testSuite = testSuiteQuery.data?.testSuite;
  const testCaseById = Object.fromEntries(
    (testCasesQuery.data?.testCases || []).map((testCase) => [testCase._id, testCase]),
  );
  const userNameById = Object.fromEntries(
    (usersQuery.data?.users || []).map((user) => [user._id, user.name]),
  );

  const rows = [...executions]
    .map((execution) => {
      const testCase = testCaseById[execution.testCaseId];
      return { ...execution, code: testCase?.code || '', title: testCase?.title || '', testCase };
    })
    .sort((a, b) => codeNumber(a.code) - codeNumber(b.code));

  const {
    search,
    onSearchChange,
    page,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    pageItems,
  } = useSearchAndPaginate(rows, SEARCH_FIELDS);

  const kpis = countsFor(executions);
  const kpiTotal = executions.length;
  const passedPercent = kpiTotal > 0 ? Math.round((kpis.pass / kpiTotal) * 100) : 0;
  const failedPercent = kpiTotal > 0 ? Math.round((kpis.fail / kpiTotal) * 100) : 0;
  const notRunPercent = kpiTotal > 0 ? Math.round((kpis.notExecuted / kpiTotal) * 100) : 0;

  const activeRow = activeIndex !== null ? rows[activeIndex] : null;

  function openExecution(row) {
    setActiveIndex(rows.findIndex((candidate) => candidate._id === row._id));
  }

  function navigateExecution(direction) {
    setActiveIndex((current) => {
      const next = current + direction;
      return next >= 0 && next < rows.length ? next : current;
    });
  }

  const viewRow = viewIndex !== null ? rows[viewIndex] : null;

  function openView(row) {
    setViewIndex(rows.findIndex((candidate) => candidate._id === row._id));
  }

  function navigateView(direction) {
    setViewIndex((current) => {
      const next = current + direction;
      return next >= 0 && next < rows.length ? next : current;
    });
  }

  return (
    <div>
      <PageHeader
        title={
          cycle
            ? t('executionCycles.executingTitle', { name: cycle.name })
            : t('executionCycles.title')
        }
        leading={<BackButton />}
        action={
          <div className={styles.headerActions}>
            <Button variant="secondary" onClick={openEdit} disabled={!cycle}>
              {t('common.edit')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate(`/projects/${projectId}/reports/${cycleId}`)}
            >
              {t('executionCycles.viewReport')}
            </Button>
            {cycle?.status !== 'closed' && (
              <>
                <label className={styles.forceLabel}>
                  <input
                    type="checkbox"
                    checked={force}
                    onChange={(event) => setForce(event.target.checked)}
                  />
                  {t('executionCycles.forceClose')}
                </label>
                <Button onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
                  {t('executionCycles.closeButton')}
                </Button>
              </>
            )}
          </div>
        }
      />

      {closeError && <p className={styles.error}>{closeError}</p>}

      {cycle && (
        <Card className={styles.infoCard}>
          <p className={styles.sectionLabel}>{t('executionCycles.generalInfo')}</p>
          <div className={styles.infoGrid}>
            <div>
              <p className={styles.infoLabel}>{t('executionCycles.fromPlan')}</p>
              <p className={styles.infoValue}>{testPlan?.name || '—'}</p>
            </div>
            <div>
              <p className={styles.infoLabel}>{t('executionCycles.suite')}</p>
              <p className={styles.infoValue}>{testSuite?.name || '—'}</p>
            </div>
            <div>
              <p className={styles.infoLabel}>{t('executionCycles.assignee')}</p>
              <p className={styles.infoValue}>{cycle.assignee || '—'}</p>
            </div>
            <div>
              <p className={styles.infoLabel}>{t('executionCycles.startDate')}</p>
              <p className={styles.infoValue}>{toDateInputValue(cycle.startDate) || '—'}</p>
            </div>
            <div>
              <p className={styles.infoLabel}>{t('executionCycles.endDate')}</p>
              <p className={styles.infoValue}>{toDateInputValue(cycle.endDate) || '—'}</p>
            </div>
            <div>
              <p className={styles.infoLabel}>{t('common.status')}</p>
              <StatusBadge
                status={cycle.status}
                label={t(`executionCycles.status_${cycle.status}`)}
              />
            </div>
            <div>
              <p className={styles.infoLabel}>{t('requirements.priority')}</p>
              <StatusBadge
                status={cycle.priority}
                label={t(`requirements.priority_${cycle.priority}`)}
              />
            </div>
          </div>
          {cycle.description && (
            <div className={styles.description}>
              <p className={styles.infoLabel}>{t('common.description')}</p>
              <p className={styles.infoValue}>{cycle.description}</p>
            </div>
          )}
        </Card>
      )}

      {!executionsQuery.isLoading && executions.length > 0 && (
        <Card className={styles.kpiCard}>
          <div className={styles.kpiRow}>
            <KpiCard label={t('executions.totalTestCasesKpi')} value={kpiTotal} accent="info" />
            <KpiCard
              label={t('executions.passedKpi')}
              value={`${passedPercent}%`}
              accent="pass"
              tone="pass"
            />
            <KpiCard
              label={t('executions.failedKpi')}
              value={`${failedPercent}%`}
              accent="fail"
              tone="fail"
            />
            <KpiCard
              label={t('executions.notRunKpi')}
              value={`${notRunPercent}%`}
              accent="warning"
            />
          </div>
          <ResultsBar counts={kpis} />
        </Card>
      )}

      <Card>
        {executionsQuery.isLoading && <LoadingState />}
        {executionsQuery.isError && <ErrorState onRetry={executionsQuery.refetch} />}
        {!executionsQuery.isLoading && !executionsQuery.isError && executions.length === 0 && (
          <EmptyState message={t('executionCycles.emptyState')} />
        )}
        {!executionsQuery.isLoading && !executionsQuery.isError && executions.length > 0 && (
          <>
            <SearchBar
              value={search}
              onChange={onSearchChange}
              placeholder={t('executions.searchTestCases')}
            />
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
                    render: (row) =>
                      row.code ? (
                        <button
                          type="button"
                          className={styles.nameLink}
                          onClick={() => openView(row)}
                        >
                          {row.title}
                        </button>
                      ) : (
                        row.testCaseId
                      ),
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
                    key: 'testPlan',
                    header: t('executionCycles.fromPlan'),
                    render: () => testPlan?.name || '—',
                  },
                  {
                    key: 'createdAt',
                    header: t('common.createdAt'),
                    render: (row) => new Date(row.createdAt).toLocaleDateString(),
                  },
                  {
                    key: 'execute',
                    header: t('executions.execute'),
                    render: (row) => (
                      <button
                        type="button"
                        className={styles.playButton}
                        onClick={() => openExecution(row)}
                        aria-label={t('executions.executeCase')}
                        title={t('executions.executeCase')}
                      >
                        ▶
                      </button>
                    ),
                  },
                ]}
                rows={pageItems}
              />
            )}
            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </>
        )}
      </Card>

      <Modal
        open={isEditOpen}
        title={t('executionCycles.editTitle')}
        onClose={() => setIsEditOpen(false)}
      >
        {editForm && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateMutation.mutate();
            }}
          >
            <TextField
              label={t('common.name')}
              value={editForm.name}
              onChange={(value) => setEditForm((prev) => ({ ...prev, name: value }))}
              required
            />
            <TextField
              label={t('common.description')}
              value={editForm.description}
              onChange={(value) => setEditForm((prev) => ({ ...prev, description: value }))}
              as="textarea"
            />
            <TextField
              label={t('executionCycles.assignee')}
              value={editForm.assignee}
              onChange={(value) => setEditForm((prev) => ({ ...prev, assignee: value }))}
            />
            <TextField
              label={t('executionCycles.startDate')}
              type="date"
              value={editForm.startDate}
              onChange={(value) => setEditForm((prev) => ({ ...prev, startDate: value }))}
            />
            <TextField
              label={t('executionCycles.endDate')}
              type="date"
              value={editForm.endDate}
              onChange={(value) => setEditForm((prev) => ({ ...prev, endDate: value }))}
            />
            <Select
              label={t('requirements.priority')}
              value={editForm.priority}
              onChange={(value) => setEditForm((prev) => ({ ...prev, priority: value }))}
              options={PRIORITIES.map((priority) => ({
                value: priority,
                label: t(`requirements.priority_${priority}`),
              }))}
            />
            <Select
              label={t('common.status')}
              value={editForm.status}
              onChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))}
              options={['planned', 'in_progress'].map((status) => ({
                value: status,
                label: t(`executionCycles.status_${status}`),
              }))}
            />
            <Button type="submit" disabled={updateMutation.isPending}>
              {t('common.save')}
            </Button>
          </form>
        )}
      </Modal>

      <Modal
        open={activeRow !== null}
        title={activeRow ? formatCaseLabel(activeRow.testCase?.testCaseId, activeRow.title) : ''}
        onClose={() => setActiveIndex(null)}
        dialogMaxWidth="min(92vw, 64rem)"
        footer={activeRow ? <div ref={setFooterNode} className={styles.footerSlot} /> : null}
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
            hasNext={activeIndex < rows.length - 1}
            quickMode
            footerContainer={footerNode}
            progressLabel={t('executionCycles.progressLabel', {
              current: activeIndex + 1,
              total: rows.length,
            })}
          />
        )}
      </Modal>

      <Modal
        open={viewRow !== null}
        title={viewRow ? formatCaseLabel(viewRow.testCase?.testCaseId, viewRow.title) : ''}
        onClose={() => setViewIndex(null)}
        variant="drawer"
        drawerWidth="min(90vw, 46rem)"
      >
        {viewRow && (
          <ExecutionDrawerContent
            key={viewRow._id}
            execution={viewRow}
            testCase={viewRow.testCase}
            projectId={projectId}
            cycleId={cycleId}
            userNameById={userNameById}
            onNavigate={navigateView}
            hasPrev={viewIndex > 0}
            hasNext={viewIndex < rows.length - 1}
            readOnly
          />
        )}
      </Modal>
    </div>
  );
}
