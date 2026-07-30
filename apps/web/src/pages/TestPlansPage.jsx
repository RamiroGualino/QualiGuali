import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testPlansApi, testCasesApi } from '../api/qaCore.api';
import { executionCyclesApi } from '../api/execution.api';
import { useSearchAndPaginate } from '../hooks/useSearchAndPaginate';
import { formatCaseLabel } from '../utils/executions';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { SearchBar } from '../components/SearchBar';
import { Pagination } from '../components/Pagination';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './TestPlansPage.module.css';

const SEARCH_FIELDS = ['name', 'description'];
const ALL_STATUSES = '';
const STATUSES = ['draft', 'active', 'closed'];
const SORT_FIELDS = ['name', 'status', 'startDate', 'endDate'];

const EMPTY_FORM = { name: '', description: '', startDate: '', endDate: '', status: 'draft' };
// Stable reference so the `|| []` fallback doesn't invalidate the useMemo
// hooks below on every render.
const EMPTY_ARRAY = [];

function toDateInputValue(value) {
  return value ? String(value).slice(0, 10) : '';
}

export function TestPlansPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [sortField, setSortField] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const [editingPlan, setEditingPlan] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  const [deletingPlan, setDeletingPlan] = useState(null);

  const [addTestCasesPlanId, setAddTestCasesPlanId] = useState(null);
  const [pendingTestCaseIds, setPendingTestCaseIds] = useState([]);

  const plansQuery = useQuery({
    queryKey: ['testPlans', projectId],
    queryFn: () => testPlansApi.list(projectId),
  });

  const testCasesQuery = useQuery({
    queryKey: ['testCases', projectId],
    queryFn: () => testCasesApi.list({ projectId }),
  });

  const cyclesQuery = useQuery({
    queryKey: ['executionCycles', projectId],
    queryFn: () => executionCyclesApi.list(projectId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      testPlansApi.create({
        projectId,
        name: form.name,
        description: form.description,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testPlans', projectId] });
      setIsCreateOpen(false);
      setForm(EMPTY_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      testPlansApi.update(editingPlan._id, {
        name: editForm.name,
        description: editForm.description,
        startDate: editForm.startDate || null,
        endDate: editForm.endDate || null,
        status: editForm.status,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testPlans', projectId] });
      setEditingPlan(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => testPlansApi.remove(deletingPlan._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testPlans', projectId] });
      setDeletingPlan(null);
    },
  });

  const addTestCasesMutation = useMutation({
    mutationFn: () => testPlansApi.addTestCases(addTestCasesPlanId, pendingTestCaseIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testPlans', projectId] });
      setAddTestCasesPlanId(null);
      setPendingTestCaseIds([]);
    },
  });

  function openEdit(plan) {
    setEditingPlan(plan);
    setEditForm({
      name: plan.name,
      description: plan.description || '',
      startDate: toDateInputValue(plan.startDate),
      endDate: toDateInputValue(plan.endDate),
      status: plan.status,
    });
  }

  function toggleTestCaseId(id) {
    setPendingTestCaseIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const plans = plansQuery.data?.testPlans || EMPTY_ARRAY;
  const testCases = testCasesQuery.data?.testCases || EMPTY_ARRAY;
  const cycles = cyclesQuery.data?.executionCycles || EMPTY_ARRAY;

  const cycleCountByPlanId = useMemo(() => {
    const counts = {};
    cycles.forEach((cycle) => {
      if (!cycle.testPlanId) return;
      counts[cycle.testPlanId] = (counts[cycle.testPlanId] || 0) + 1;
    });
    return counts;
  }, [cycles]);

  const filteredByStatus = useMemo(
    () => (statusFilter ? plans.filter((plan) => plan.status === statusFilter) : plans),
    [plans, statusFilter],
  );

  const sortedPlans = useMemo(() => {
    const copy = [...filteredByStatus];
    copy.sort((a, b) => {
      const left = a[sortField] || '';
      const right = b[sortField] || '';
      const comparison = String(left).localeCompare(String(right));
      return sortDir === 'asc' ? comparison : -comparison;
    });
    return copy;
  }, [filteredByStatus, sortField, sortDir]);

  const {
    search,
    onSearchChange,
    page,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    pageItems,
  } = useSearchAndPaginate(sortedPlans, SEARCH_FIELDS);

  const isLoading = plansQuery.isLoading || cyclesQuery.isLoading;

  return (
    <div>
      <PageHeader
        title={t('testPlans.title')}
        action={
          <Button onClick={() => setIsCreateOpen(true)}>{t('testPlans.createButton')}</Button>
        }
      />

      <Card>
        {isLoading && <LoadingState />}
        {plansQuery.isError && <ErrorState onRetry={plansQuery.refetch} />}
        {!isLoading && !plansQuery.isError && plans.length === 0 && (
          <EmptyState message={t('testPlans.emptyState')} />
        )}
        {!isLoading && !plansQuery.isError && plans.length > 0 && (
          <>
            <div className={styles.toolbar}>
              <SearchBar value={search} onChange={onSearchChange} />
              <Select
                label={t('common.status')}
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: ALL_STATUSES, label: t('common.all') },
                  ...STATUSES.map((status) => ({
                    value: status,
                    label: t(`testPlans.status_${status}`),
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
                  { key: 'name', header: t('common.name') },
                  {
                    key: 'status',
                    header: t('common.status'),
                    render: (row) => (
                      <StatusBadge
                        status={row.status}
                        label={t(`testPlans.status_${row.status}`)}
                      />
                    ),
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
                    key: 'cycleCount',
                    header: t('executionCycles.title'),
                    render: (row) =>
                      t('testPlans.cycleCount', { count: cycleCountByPlanId[row._id] || 0 }),
                  },
                  {
                    key: 'actions',
                    header: t('common.actions'),
                    render: (row) => (
                      <RowActionsMenu
                        actions={[
                          {
                            label: t('testPlans.viewCycles'),
                            onClick: () =>
                              navigate(
                                `/projects/${projectId}/execution-cycles?testPlanId=${row._id}`,
                              ),
                          },
                          { label: t('common.edit'), onClick: () => openEdit(row) },
                          {
                            label: t('testPlans.addTestCases'),
                            onClick: () => {
                              setAddTestCasesPlanId(row._id);
                              setPendingTestCaseIds([]);
                            },
                          },
                          {
                            label: t('common.delete'),
                            danger: true,
                            onClick: () => setDeletingPlan(row),
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
        title={t('testPlans.createTitle')}
        onClose={() => setIsCreateOpen(false)}
        variant="drawer"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <TextField
            label={t('common.name')}
            value={form.name}
            onChange={(value) => setForm((prev) => ({ ...prev, name: value }))}
            required
          />
          <TextField
            label={t('common.description')}
            value={form.description}
            onChange={(value) => setForm((prev) => ({ ...prev, description: value }))}
            as="textarea"
          />
          <TextField
            label={t('executionCycles.startDate')}
            type="date"
            value={form.startDate}
            onChange={(value) => setForm((prev) => ({ ...prev, startDate: value }))}
          />
          <TextField
            label={t('executionCycles.endDate')}
            type="date"
            value={form.endDate}
            onChange={(value) => setForm((prev) => ({ ...prev, endDate: value }))}
          />
          <Button type="submit" disabled={createMutation.isPending}>
            {t('common.create')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingPlan)}
        title={t('testPlans.editTitle')}
        onClose={() => setEditingPlan(null)}
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
            label={t('common.status')}
            value={editForm.status}
            onChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))}
            options={STATUSES.map((status) => ({
              value: status,
              label: t(`testPlans.status_${status}`),
            }))}
          />
          <Button type="submit" disabled={updateMutation.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(addTestCasesPlanId)}
        title={t('testPlans.addTestCases')}
        onClose={() => setAddTestCasesPlanId(null)}
      >
        <div className={styles.checkList}>
          {testCases.map((testCase) => (
            <label key={testCase._id} className={styles.checkItem}>
              <input
                type="checkbox"
                checked={pendingTestCaseIds.includes(testCase._id)}
                onChange={() => toggleTestCaseId(testCase._id)}
              />
              {formatCaseLabel(testCase.testCaseId, testCase.title)}
            </label>
          ))}
        </div>
        <Button
          onClick={() => addTestCasesMutation.mutate()}
          disabled={addTestCasesMutation.isPending || pendingTestCaseIds.length === 0}
        >
          {t('common.save')}
        </Button>
      </Modal>

      <ConfirmModal
        open={Boolean(deletingPlan)}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        onCancel={() => setDeletingPlan(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />
    </div>
  );
}
