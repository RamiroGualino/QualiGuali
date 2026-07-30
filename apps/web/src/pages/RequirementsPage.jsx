import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { requirementsApi, testSuitesApi, testCasesApi } from '../api/qaCore.api';
import { modulesApi } from '../api/projects.api';
import { useSearchAndPaginate } from '../hooks/useSearchAndPaginate';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { SearchBar } from '../components/SearchBar';
import { Pagination } from '../components/Pagination';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './RequirementsPage.module.css';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['pending', 'in_test', 'finished', 'cancelled'];
const SEARCH_FIELDS = ['code', 'title'];
const NO_MODULE = '__none__';
const ALL_STATUSES = '';
const ALL_PRIORITIES = '';
// Stable reference so the `|| []` fallback doesn't invalidate the useMemo
// below on every render.
const EMPTY_ARRAY = [];

function moduleFieldProps(moduleId, modules, t) {
  return {
    label: t('nav.modules'),
    value: moduleId || NO_MODULE,
    options: [
      { value: NO_MODULE, label: t('common.none') },
      ...modules.map((module) => ({ value: module._id, label: module.name })),
    ],
  };
}

// Master-detail: left panel is a searchable list of the project's Modules
// (selecting one filters the right panel); right panel is the Requirements
// table for whatever's selected (or every requirement, with no module
// selected). Reached both from the "Requerimientos" tab and from Modules'
// "Visualizar" action (which pre-selects a module via ?moduleId=).
export function RequirementsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedModuleId = searchParams.get('moduleId') || '';
  const [moduleFilter, setModuleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [priorityFilter, setPriorityFilter] = useState(ALL_PRIORITIES);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [createModuleId, setCreateModuleId] = useState('');
  const [jiraUrl, setJiraUrl] = useState('');

  const [editingRequirement, setEditingRequirement] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editStatus, setEditStatus] = useState('pending');
  const [editJiraUrl, setEditJiraUrl] = useState('');

  const [deletingRequirement, setDeletingRequirement] = useState(null);

  const modulesQuery = useQuery({
    queryKey: ['modules', projectId],
    queryFn: () => modulesApi.list(projectId),
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['requirements', projectId, selectedModuleId],
    queryFn: () => requirementsApi.list(projectId, selectedModuleId || undefined),
  });

  const testSuitesQuery = useQuery({
    queryKey: ['testSuites', 'project', projectId],
    queryFn: () => testSuitesApi.list({ projectId }),
  });
  const testCasesQuery = useQuery({
    queryKey: ['testCases', projectId],
    queryFn: () => testCasesApi.list({ projectId }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      requirementsApi.create({
        projectId,
        moduleId: createModuleId || undefined,
        title,
        description,
        priority,
        jiraUrl: jiraUrl || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', projectId] });
      setIsCreateOpen(false);
      setTitle('');
      setDescription('');
      setPriority('medium');
      setJiraUrl('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      requirementsApi.update(editingRequirement._id, {
        title: editTitle,
        description: editDescription,
        priority: editPriority,
        status: editStatus,
        jiraUrl: editJiraUrl,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', projectId] });
      setEditingRequirement(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => requirementsApi.remove(deletingRequirement._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requirements', projectId] });
      setDeletingRequirement(null);
    },
  });

  // Quick status change straight from the table row — no need to open the
  // edit modal just to move a requirement along.
  const statusChangeMutation = useMutation({
    mutationFn: ({ id, status }) => requirementsApi.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['requirements', projectId] }),
  });

  function openCreate() {
    setCreateModuleId(selectedModuleId);
    setIsCreateOpen(true);
  }

  function openEdit(requirement) {
    setEditingRequirement(requirement);
    setEditTitle(requirement.title);
    setEditDescription(requirement.description || '');
    setEditPriority(requirement.priority);
    setEditStatus(requirement.status);
    setEditJiraUrl(requirement.jiraUrl || '');
  }

  function selectModule(moduleId) {
    setSearchParams(moduleId ? { moduleId } : {});
  }

  const requirements = data?.requirements || EMPTY_ARRAY;
  const modules = modulesQuery.data?.modules || EMPTY_ARRAY;
  const testSuites = testSuitesQuery.data?.testSuites || EMPTY_ARRAY;
  const testCases = testCasesQuery.data?.testCases || EMPTY_ARRAY;

  const filteredModules = useMemo(() => {
    if (!moduleFilter.trim()) return modules;
    const term = moduleFilter.trim().toLowerCase();
    return modules.filter((module) => module.name.toLowerCase().includes(term));
  }, [modules, moduleFilter]);

  const suiteCountByRequirementId = {};
  testSuites.forEach((suite) => {
    suiteCountByRequirementId[suite.requirementId] =
      (suiteCountByRequirementId[suite.requirementId] || 0) + 1;
  });
  const suiteIdToRequirementId = Object.fromEntries(
    testSuites.map((suite) => [suite._id, suite.requirementId]),
  );
  const testCaseCountByRequirementId = {};
  testCases.forEach((testCase) => {
    const requirementId = suiteIdToRequirementId[testCase.suiteId];
    if (!requirementId) return;
    testCaseCountByRequirementId[requirementId] =
      (testCaseCountByRequirementId[requirementId] || 0) + 1;
  });

  const filteredRequirements = useMemo(
    () =>
      requirements.filter(
        (requirement) =>
          (!statusFilter || requirement.status === statusFilter) &&
          (!priorityFilter || requirement.priority === priorityFilter),
      ),
    [requirements, statusFilter, priorityFilter],
  );

  const {
    search,
    onSearchChange,
    page,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    pageItems,
  } = useSearchAndPaginate(filteredRequirements, SEARCH_FIELDS);

  return (
    <div>
      <PageHeader
        title={t('requirements.title')}
        action={<Button onClick={openCreate}>{t('requirements.createButton')}</Button>}
      />

      <div className={styles.masterDetail}>
        <Card className={styles.modulesPanel}>
          <SearchBar
            value={moduleFilter}
            onChange={setModuleFilter}
            placeholder={t('requirements.filterModules')}
          />
          <ul className={styles.moduleList}>
            <li>
              <button
                type="button"
                className={[styles.moduleItem, !selectedModuleId && styles.moduleItemActive]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => selectModule('')}
              >
                {t('common.all')}
              </button>
            </li>
            {filteredModules.map((module) => (
              <li key={module._id}>
                <button
                  type="button"
                  className={[
                    styles.moduleItem,
                    selectedModuleId === module._id && styles.moduleItemActive,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => selectModule(module._id)}
                >
                  {module.name}
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card className={styles.detailPanel}>
          {isLoading && <LoadingState />}
          {isError && <ErrorState onRetry={refetch} />}
          {!isLoading && !isError && requirements.length === 0 && (
            <EmptyState message={t('requirements.emptyState')} />
          )}
          {!isLoading && !isError && requirements.length > 0 && (
            <>
              <div className={styles.filters}>
                <SearchBar value={search} onChange={onSearchChange} />
                <Select
                  label={t('common.status')}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: ALL_STATUSES, label: t('common.all') },
                    ...STATUSES.map((value) => ({
                      value,
                      label: t(`requirements.status_${value}`),
                    })),
                  ]}
                />
                <Select
                  label={t('requirements.priority')}
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                  options={[
                    { value: ALL_PRIORITIES, label: t('common.all') },
                    ...PRIORITIES.map((value) => ({
                      value,
                      label: t(`requirements.priority_${value}`),
                    })),
                  ]}
                />
              </div>
              {pageItems.length === 0 && <EmptyState message={t('common.noResults')} />}
              {pageItems.length > 0 && (
                <Table
                  columns={[
                    {
                      key: 'code',
                      header: t('requirements.code'),
                      render: (row) =>
                        row.jiraUrl ? (
                          <a
                            href={row.jiraUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.codeLink}
                            title={t('requirements.viewInJira')}
                          >
                            {row.code}
                          </a>
                        ) : (
                          row.code
                        ),
                    },
                    {
                      key: 'title',
                      header: t('requirements.titleField'),
                      render: (row) => row.title,
                    },
                    {
                      key: 'description',
                      header: t('common.description'),
                      render: (row) => (
                        <span className={styles.truncate}>{row.description || '—'}</span>
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
                      key: 'status',
                      header: t('common.status'),
                      render: (row) => (
                        <Select
                          value={row.status}
                          onChange={(status) =>
                            statusChangeMutation.mutate({ id: row._id, status })
                          }
                          options={STATUSES.map((value) => ({
                            value,
                            label: t(`requirements.status_${value}`),
                          }))}
                        />
                      ),
                    },
                    {
                      key: 'coverage',
                      header: t('testSuites.title'),
                      render: (row) => (
                        <button
                          type="button"
                          className={styles.coverageBadge}
                          onClick={() =>
                            navigate(`/projects/${projectId}/test-suites?requirementId=${row._id}`)
                          }
                        >
                          {suiteCountByRequirementId[row._id] || 0} {t('testSuites.title')} ·{' '}
                          {testCaseCountByRequirementId[row._id] || 0} {t('nav.testCases')}
                        </button>
                      ),
                    },
                    {
                      key: 'createdAt',
                      header: t('common.createdAt'),
                      render: (row) => new Date(row.createdAt).toLocaleDateString(),
                    },
                    {
                      key: 'actions',
                      header: t('common.actions'),
                      render: (row) => (
                        <RowActionsMenu
                          actions={[
                            { label: t('common.edit'), onClick: () => openEdit(row) },
                            {
                              label: t('common.delete'),
                              danger: true,
                              onClick: () => setDeletingRequirement(row),
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
      </div>

      <Modal
        open={isCreateOpen}
        title={t('requirements.createTitle')}
        onClose={() => setIsCreateOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <TextField
            label={t('requirements.titleField')}
            value={title}
            onChange={setTitle}
            required
          />
          <TextField
            label={t('common.description')}
            value={description}
            onChange={setDescription}
            as="textarea"
          />
          <Select
            {...moduleFieldProps(createModuleId, modules, t)}
            onChange={(value) => setCreateModuleId(value === NO_MODULE ? '' : value)}
          />
          <Select
            label={t('requirements.priority')}
            value={priority}
            onChange={setPriority}
            options={PRIORITIES.map((value) => ({
              value,
              label: t(`requirements.priority_${value}`),
            }))}
          />
          <TextField
            label={t('requirements.jiraUrl')}
            value={jiraUrl}
            onChange={setJiraUrl}
            type="url"
            placeholder="https://your-domain.atlassian.net/browse/QG-1"
          />
          <Button type="submit" disabled={createMutation.isPending}>
            {t('common.create')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingRequirement)}
        title={t('requirements.editTitle')}
        onClose={() => setEditingRequirement(null)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.mutate();
          }}
        >
          <TextField
            label={t('requirements.titleField')}
            value={editTitle}
            onChange={setEditTitle}
            required
          />
          <TextField
            label={t('common.description')}
            value={editDescription}
            onChange={setEditDescription}
            as="textarea"
          />
          <Select
            label={t('requirements.priority')}
            value={editPriority}
            onChange={setEditPriority}
            options={PRIORITIES.map((value) => ({
              value,
              label: t(`requirements.priority_${value}`),
            }))}
          />
          <Select
            label={t('common.status')}
            value={editStatus}
            onChange={setEditStatus}
            options={STATUSES.map((value) => ({
              value,
              label: t(`requirements.status_${value}`),
            }))}
          />
          <TextField
            label={t('requirements.jiraUrl')}
            value={editJiraUrl}
            onChange={setEditJiraUrl}
            type="url"
            placeholder="https://your-domain.atlassian.net/browse/QG-1"
          />
          <Button type="submit" disabled={updateMutation.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deletingRequirement)}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        onCancel={() => setDeletingRequirement(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />
    </div>
  );
}
