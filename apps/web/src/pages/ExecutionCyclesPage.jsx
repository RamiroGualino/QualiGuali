import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { executionCyclesApi } from '../api/execution.api';
import { testPlansApi, testSuitesApi, testCasesApi } from '../api/qaCore.api';
import { useSearchAndPaginate } from '../hooks/useSearchAndPaginate';
import { formatCaseLabel } from '../utils/executions';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { TextField } from '../components/TextField';
import { Combobox } from '../components/Combobox';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { SearchBar } from '../components/SearchBar';
import { Pagination } from '../components/Pagination';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { StatusBadge } from '../components/StatusBadge';
import { ResultsBar } from '../components/ResultsBar';
import { CycleQuickExecutionModal } from '../components/CycleQuickExecutionModal';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './ExecutionCyclesPage.module.css';

const SEARCH_FIELDS = ['name'];
const ALL = '';
const STATUSES = ['planned', 'in_progress', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const SORT_FIELDS = ['name', 'status', 'priority', 'startDate', 'endDate'];

const EMPTY_CREATE_FORM = {
  name: '',
  description: '',
  testPlanId: '',
  suiteId: '',
  assignee: '',
  startDate: '',
  endDate: '',
  priority: 'medium',
};

const EMPTY_EDIT_FORM = {
  name: '',
  description: '',
  assignee: '',
  startDate: '',
  endDate: '',
  priority: 'medium',
  status: 'planned',
};

function toDateInputValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

// Stable reference so the `|| []` fallback doesn't invalidate the useMemo
// hooks below on every render.
const EMPTY_ARRAY = [];

function countsFor(executions) {
  return {
    pass: executions.filter((execution) => execution.status === 'pass').length,
    fail: executions.filter((execution) => execution.status === 'fail').length,
    blocked: executions.filter((execution) => execution.status === 'blocked').length,
    notExecuted: executions.filter((execution) => execution.status === 'not_executed').length,
  };
}

export function ExecutionCyclesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [planFilter, setPlanFilter] = useState(searchParams.get('testPlanId') || '');
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [priorityFilter, setPriorityFilter] = useState(ALL);
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [selectedCaseIds, setSelectedCaseIds] = useState([]);
  const [caseSearch, setCaseSearch] = useState('');

  const [editingCycle, setEditingCycle] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);

  const [deletingCycle, setDeletingCycle] = useState(null);
  const [executingCycleId, setExecutingCycleId] = useState(null);

  const cyclesQuery = useQuery({
    queryKey: ['executionCycles', projectId],
    queryFn: () => executionCyclesApi.list(projectId),
  });

  const testPlansQuery = useQuery({
    queryKey: ['testPlans', projectId],
    queryFn: () => testPlansApi.list(projectId),
  });

  const testSuitesQuery = useQuery({
    queryKey: ['testSuites', 'project', projectId],
    queryFn: () => testSuitesApi.list({ projectId }),
  });

  const suiteCasesQuery = useQuery({
    queryKey: ['testCases', projectId, 'bySuite', createForm.suiteId],
    queryFn: () => testCasesApi.list({ projectId, suiteId: createForm.suiteId }),
    enabled: Boolean(createForm.suiteId),
  });

  const cycles = cyclesQuery.data?.executionCycles || EMPTY_ARRAY;
  const testPlans = testPlansQuery.data?.testPlans || EMPTY_ARRAY;
  const testSuites = testSuitesQuery.data?.testSuites || EMPTY_ARRAY;
  const suiteCases = suiteCasesQuery.data?.testCases || EMPTY_ARRAY;

  const planNameById = Object.fromEntries(testPlans.map((plan) => [plan._id, plan.name]));
  const suiteNameById = Object.fromEntries(testSuites.map((suite) => [suite._id, suite.name]));

  const executionsQueries = useQueries({
    queries: cycles.map((cycle) => ({
      queryKey: ['executions', cycle._id],
      queryFn: () => executionCyclesApi.listExecutions(cycle._id),
    })),
  });

  const executionsUpdatedAt = executionsQueries.map((query) => query.dataUpdatedAt).join(',');
  const countsByCycleId = useMemo(() => {
    const map = {};
    cycles.forEach((cycle, index) => {
      const executions = executionsQueries[index]?.data?.executions || [];
      map[cycle._id] = { ...countsFor(executions), total: executions.length };
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycles, executionsUpdatedAt]);

  const createMutation = useMutation({
    mutationFn: () =>
      executionCyclesApi.create({
        projectId,
        name: createForm.name,
        description: createForm.description,
        testPlanId: createForm.testPlanId,
        suiteId: createForm.suiteId,
        assignee: createForm.assignee || undefined,
        startDate: createForm.startDate || undefined,
        endDate: createForm.endDate || undefined,
        priority: createForm.priority,
        testCaseIds: selectedCaseIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executionCycles', projectId] });
      setIsCreateOpen(false);
      setCreateForm(EMPTY_CREATE_FORM);
      setSelectedCaseIds([]);
      setCaseSearch('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      executionCyclesApi.update(editingCycle._id, {
        name: editForm.name,
        description: editForm.description,
        assignee: editForm.assignee || null,
        startDate: editForm.startDate || null,
        endDate: editForm.endDate || null,
        priority: editForm.priority,
        status: editForm.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executionCycles', projectId] });
      setEditingCycle(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => executionCyclesApi.remove(deletingCycle._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executionCycles', projectId] });
      setDeletingCycle(null);
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (cycleId) => executionCyclesApi.duplicate(cycleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['executionCycles', projectId] });
    },
  });

  function openEdit(cycle) {
    setEditingCycle(cycle);
    setEditForm({
      name: cycle.name,
      description: cycle.description || '',
      assignee: cycle.assignee || '',
      startDate: toDateInputValue(cycle.startDate),
      endDate: toDateInputValue(cycle.endDate),
      priority: cycle.priority || 'medium',
      status: cycle.status === 'closed' ? 'planned' : cycle.status,
    });
  }

  function toggleCaseId(id) {
    setSelectedCaseIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const visibleSuiteCases = useMemo(() => {
    if (!caseSearch.trim()) return suiteCases;
    const term = caseSearch.trim().toLowerCase();
    return suiteCases.filter(
      (testCase) =>
        (testCase.testCaseId || '').toLowerCase().includes(term) ||
        testCase.title.toLowerCase().includes(term),
    );
  }, [suiteCases, caseSearch]);

  const filteredCycles = useMemo(() => {
    return cycles.filter(
      (cycle) =>
        (!planFilter || cycle.testPlanId === planFilter) &&
        (!statusFilter || cycle.status === statusFilter) &&
        (!priorityFilter || cycle.priority === priorityFilter),
    );
  }, [cycles, planFilter, statusFilter, priorityFilter]);

  const sortedCycles = useMemo(() => {
    const copy = [...filteredCycles];
    copy.sort((a, b) => {
      const left = a[sortField] || '';
      const right = b[sortField] || '';
      const comparison = String(left).localeCompare(String(right));
      return sortDir === 'asc' ? comparison : -comparison;
    });
    return copy;
  }, [filteredCycles, sortField, sortDir]);

  const {
    search,
    onSearchChange,
    page,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    pageItems,
  } = useSearchAndPaginate(sortedCycles, SEARCH_FIELDS);

  const isLoading = cyclesQuery.isLoading || testPlansQuery.isLoading || testSuitesQuery.isLoading;

  return (
    <div>
      <PageHeader
        title={t('executionCycles.title')}
        action={
          <Button onClick={() => setIsCreateOpen(true)}>{t('executionCycles.createButton')}</Button>
        }
      />

      <Card>
        {isLoading && <LoadingState />}
        {cyclesQuery.isError && <ErrorState onRetry={cyclesQuery.refetch} />}
        {!isLoading && !cyclesQuery.isError && cycles.length === 0 && (
          <EmptyState message={t('executionCycles.emptyState')} />
        )}
        {!isLoading && !cyclesQuery.isError && cycles.length > 0 && (
          <>
            <div className={styles.toolbar}>
              <SearchBar value={search} onChange={onSearchChange} />
              <Select
                label={t('executionCycles.fromPlan')}
                value={planFilter}
                onChange={setPlanFilter}
                options={[
                  { value: ALL, label: t('common.all') },
                  ...testPlans.map((plan) => ({ value: plan._id, label: plan.name })),
                ]}
              />
              <Select
                label={t('common.status')}
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: ALL, label: t('common.all') },
                  ...STATUSES.map((status) => ({
                    value: status,
                    label: t(`executionCycles.status_${status}`),
                  })),
                ]}
              />
              <Select
                label={t('requirements.priority')}
                value={priorityFilter}
                onChange={setPriorityFilter}
                options={[
                  { value: ALL, label: t('common.all') },
                  ...PRIORITIES.map((priority) => ({
                    value: priority,
                    label: t(`requirements.priority_${priority}`),
                  })),
                ]}
              />
              <Select
                label={t('common.sortBy')}
                value={sortField}
                onChange={setSortField}
                options={SORT_FIELDS.map((field) => ({
                  value: field,
                  label: t(
                    field === 'name' || field === 'status'
                      ? `common.${field}`
                      : field === 'priority'
                        ? 'requirements.priority'
                        : `executionCycles.${field}`,
                  ),
                }))}
              />
              <Button
                variant="secondary"
                onClick={() => setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))}
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </Button>
            </div>

            {pageItems.length === 0 && <EmptyState message={t('common.noResults')} />}
            {pageItems.length > 0 && (
              <Table
                columns={[
                  {
                    key: 'name',
                    header: t('common.name'),
                    render: (row) => (
                      <button
                        type="button"
                        className={styles.nameLink}
                        onClick={() =>
                          navigate(`/projects/${projectId}/execution-cycles/${row._id}`)
                        }
                      >
                        {row.name}
                      </button>
                    ),
                  },
                  {
                    key: 'testPlanId',
                    header: t('executionCycles.fromPlan'),
                    render: (row) => planNameById[row.testPlanId] || '—',
                  },
                  {
                    key: 'suiteId',
                    header: t('executionCycles.suite'),
                    render: (row) => suiteNameById[row.suiteId] || '—',
                  },
                  {
                    key: 'assignee',
                    header: t('executionCycles.assignee'),
                    render: (row) => row.assignee || '—',
                  },
                  {
                    key: 'startDate',
                    header: t('executionCycles.startDate'),
                    render: (row) => toDateInputValue(row.startDate) || '—',
                  },
                  {
                    key: 'endDate',
                    header: t('executionCycles.endDate'),
                    render: (row) => toDateInputValue(row.endDate) || '—',
                  },
                  {
                    key: 'testCaseCount',
                    header: t('nav.testCases'),
                    render: (row) => countsByCycleId[row._id]?.total || 0,
                  },
                  {
                    key: 'results',
                    header: t('common.total'),
                    render: (row) => <ResultsBar counts={countsByCycleId[row._id] || {}} compact />,
                  },
                  {
                    key: 'status',
                    header: t('common.status'),
                    render: (row) => (
                      <StatusBadge
                        status={row.status}
                        label={t(`executionCycles.status_${row.status}`)}
                      />
                    ),
                  },
                  {
                    key: 'priority',
                    header: t('requirements.priority'),
                    render: (row) => (
                      <StatusBadge
                        status={row.priority}
                        label={t(`requirements.priority_${row.priority}`)}
                      />
                    ),
                  },
                  {
                    key: 'quickActions',
                    header: '',
                    render: (row) => (
                      <div className={styles.quickActionsCell}>
                        <button
                          type="button"
                          className={styles.viewButton}
                          onClick={() =>
                            navigate(`/projects/${projectId}/execution-cycles/${row._id}`)
                          }
                          aria-label={t('executionCycles.viewCycle')}
                          title={t('executionCycles.viewCycle')}
                        >
                          👁
                        </button>
                        <button
                          type="button"
                          className={styles.playButton}
                          onClick={() => setExecutingCycleId(row._id)}
                          aria-label={t('executionCycles.playCycle')}
                          title={t('executionCycles.playCycle')}
                        >
                          ▶
                        </button>
                      </div>
                    ),
                  },
                  {
                    key: 'actions',
                    header: t('common.actions'),
                    render: (row) => (
                      <RowActionsMenu
                        actions={[
                          {
                            label: t('requirements.view'),
                            onClick: () =>
                              navigate(`/projects/${projectId}/execution-cycles/${row._id}`),
                          },
                          { label: t('common.edit'), onClick: () => openEdit(row) },
                          {
                            label: t('common.duplicate'),
                            onClick: () => duplicateMutation.mutate(row._id),
                          },
                          {
                            label: t('common.delete'),
                            danger: true,
                            onClick: () => setDeletingCycle(row),
                          },
                        ]}
                      />
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
        open={isCreateOpen}
        title={t('executionCycles.createTitle')}
        onClose={() => setIsCreateOpen(false)}
        variant="drawer"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <Combobox
            label={t('common.name')}
            value={createForm.name}
            onChange={(value) => {
              // Cycles are almost always named after their suite (which is
              // itself usually named after its requirement) — matching the
              // typed/picked name to a suite auto-selects it too, so its
              // test cases show up below without a separate manual pick.
              const matchedSuite = testSuites.find((suite) => suite.name === value);
              setCreateForm((prev) => ({
                ...prev,
                name: value,
                suiteId: matchedSuite ? matchedSuite._id : prev.suiteId,
              }));
              if (matchedSuite) setSelectedCaseIds([]);
            }}
            required
            options={testSuites.map((suite) => ({ value: suite._id, label: suite.name }))}
          />
          <TextField
            label={t('common.description')}
            value={createForm.description}
            onChange={(value) => setCreateForm((prev) => ({ ...prev, description: value }))}
            as="textarea"
          />
          <Select
            label={t('executionCycles.fromPlan')}
            value={createForm.testPlanId}
            onChange={(value) => setCreateForm((prev) => ({ ...prev, testPlanId: value }))}
            required
            options={[
              { value: '', label: t('executionCycles.selectPlan') },
              ...testPlans.map((plan) => ({ value: plan._id, label: plan.name })),
            ]}
          />
          <Select
            label={t('executionCycles.suite')}
            value={createForm.suiteId}
            onChange={(value) => {
              // Cycles are almost always named after their suite — pre-fill
              // Name too, but only while it's still untouched, so this
              // never overwrites something the user already typed.
              const suite = testSuites.find((candidate) => candidate._id === value);
              setCreateForm((prev) => ({
                ...prev,
                suiteId: value,
                name: !prev.name && suite ? suite.name : prev.name,
              }));
              setSelectedCaseIds([]);
            }}
            required
            options={[
              { value: '', label: t('executionCycles.selectSuite') },
              ...testSuites.map((suite) => ({ value: suite._id, label: suite.name })),
            ]}
          />

          {createForm.suiteId && (
            <div className={styles.field}>
              <p className={styles.label}>{t('testPlans.selectTestCases')}</p>
              <div className={styles.caseToolbar}>
                <SearchBar
                  value={caseSearch}
                  onChange={setCaseSearch}
                  placeholder={t('executionCycles.searchCases')}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedCaseIds(visibleSuiteCases.map((tc) => tc._id))}
                >
                  {t('executionCycles.selectAllCases')}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSelectedCaseIds([])}>
                  {t('executionCycles.deselectAllCases')}
                </Button>
              </div>
              {suiteCasesQuery.isLoading && <LoadingState />}
              {!suiteCasesQuery.isLoading && visibleSuiteCases.length === 0 && (
                <p className={styles.hint}>{t('common.noResults')}</p>
              )}
              <div className={styles.checkList}>
                {visibleSuiteCases.map((testCase) => (
                  <label key={testCase._id} className={styles.checkItem}>
                    <input
                      type="checkbox"
                      checked={selectedCaseIds.includes(testCase._id)}
                      onChange={() => toggleCaseId(testCase._id)}
                    />
                    {formatCaseLabel(testCase.testCaseId, testCase.title)}
                  </label>
                ))}
              </div>
            </div>
          )}

          <TextField
            label={t('executionCycles.assignee')}
            value={createForm.assignee}
            onChange={(value) => setCreateForm((prev) => ({ ...prev, assignee: value }))}
          />
          <TextField
            label={t('executionCycles.startDate')}
            type="date"
            value={createForm.startDate}
            onChange={(value) => setCreateForm((prev) => ({ ...prev, startDate: value }))}
          />
          <TextField
            label={t('executionCycles.endDate')}
            type="date"
            value={createForm.endDate}
            onChange={(value) => setCreateForm((prev) => ({ ...prev, endDate: value }))}
          />
          <Select
            label={t('requirements.priority')}
            value={createForm.priority}
            onChange={(value) => setCreateForm((prev) => ({ ...prev, priority: value }))}
            options={PRIORITIES.map((priority) => ({
              value: priority,
              label: t(`requirements.priority_${priority}`),
            }))}
          />
          <Button
            type="submit"
            disabled={createMutation.isPending || !createForm.testPlanId || !createForm.suiteId}
          >
            {t('common.create')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingCycle)}
        title={t('executionCycles.editTitle')}
        onClose={() => setEditingCycle(null)}
      >
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
      </Modal>

      <ConfirmModal
        open={Boolean(deletingCycle)}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        onCancel={() => setDeletingCycle(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />

      <CycleQuickExecutionModal
        projectId={projectId}
        cycleId={executingCycleId}
        onClose={() => setExecutingCycleId(null)}
      />
    </div>
  );
}
