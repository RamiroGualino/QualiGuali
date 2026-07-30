import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testSuitesApi, requirementsApi, testCasesApi } from '../api/qaCore.api';
import { useSearchAndPaginate } from '../hooks/useSearchAndPaginate';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { TextField } from '../components/TextField';
import { Select } from '../components/Select';
import { Combobox } from '../components/Combobox';
import { Table } from '../components/Table';
import { SearchBar } from '../components/SearchBar';
import { Pagination } from '../components/Pagination';
import { RowActionsMenu } from '../components/RowActionsMenu';
import { Badge } from '../components/Badge';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './TestSuitesPage.module.css';

const SEARCH_FIELDS = ['name', 'description'];
const ALL_REQUIREMENTS = '';

// Flat listing (not a tree) per explicit request: every Suite in the
// project, with its Requirement for traceability. "View" hands off to
// TestCasesPage pre-filtered by suiteId, which already has full CRUD.
export function TestSuitesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // URL-driven (not just local state) so other screens — e.g. the
  // Requirements list's coverage badge — can deep-link straight to this
  // suite's requirement already filtered.
  const [searchParams, setSearchParams] = useSearchParams();
  const requirementFilter = searchParams.get('requirementId') || ALL_REQUIREMENTS;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [createRequirementId, setCreateRequirementId] = useState('');
  // What's typed/picked in the requirement Combobox — kept separate from
  // createRequirementId since a native datalist only round-trips visible
  // text, not the requirement's own id.
  const [requirementSearch, setRequirementSearch] = useState('');

  const [editingSuite, setEditingSuite] = useState(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [deletingSuite, setDeletingSuite] = useState(null);

  const requirementsQuery = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => requirementsApi.list(projectId),
  });

  const suitesQuery = useQuery({
    queryKey: ['testSuites', 'project', projectId, requirementFilter],
    queryFn: () => testSuitesApi.list({ projectId, requirementId: requirementFilter || undefined }),
  });

  const testCasesQuery = useQuery({
    queryKey: ['testCases', projectId],
    queryFn: () => testCasesApi.list({ projectId }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      testSuitesApi.create({
        projectId,
        requirementId: createRequirementId,
        name,
        description,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testSuites'] });
      setIsCreateOpen(false);
      setName('');
      setDescription('');
      setCreateRequirementId('');
      setRequirementSearch('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      testSuitesApi.update(editingSuite._id, { name: editName, description: editDescription }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testSuites'] });
      setEditingSuite(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => testSuitesApi.remove(deletingSuite._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testSuites'] });
      // Deleting a suite cascades to its test cases server-side now, so
      // any cached test-case list needs to drop them too.
      queryClient.invalidateQueries({ queryKey: ['testCases'] });
      setDeletingSuite(null);
    },
  });

  function openEdit(suite) {
    setEditingSuite(suite);
    setEditName(suite.name);
    setEditDescription(suite.description || '');
  }

  function viewSuite(suite) {
    navigate(`/projects/${projectId}/test-cases?suiteId=${suite._id}`);
  }

  // Suites are almost always named after their requirement, so picking one
  // pre-fills the Name field too — only while it's still untouched, so this
  // never overwrites something the user already typed themselves.
  function handleRequirementSearchChange(text) {
    setRequirementSearch(text);
    const matched = requirements.find((req) => req.title === text);
    setCreateRequirementId(matched ? matched._id : '');
    if (matched && !name) {
      setName(matched.title);
    }
  }

  function setRequirementFilter(requirementId) {
    setSearchParams(requirementId ? { requirementId } : {});
  }

  const requirements = requirementsQuery.data?.requirements || [];
  const suites = suitesQuery.data?.testSuites || [];
  const testCases = testCasesQuery.data?.testCases || [];

  const requirementById = Object.fromEntries(requirements.map((req) => [req._id, req]));
  const testCaseCountBySuiteId = {};
  testCases.forEach((testCase) => {
    testCaseCountBySuiteId[testCase.suiteId] = (testCaseCountBySuiteId[testCase.suiteId] || 0) + 1;
  });

  const {
    search,
    onSearchChange,
    page,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    pageItems,
  } = useSearchAndPaginate(suites, SEARCH_FIELDS);

  const isLoading = suitesQuery.isLoading || requirementsQuery.isLoading;

  return (
    <div>
      <PageHeader
        title={t('testSuites.title')}
        action={
          <Button icon="+" onClick={() => setIsCreateOpen(true)}>
            {t('testSuites.createButton')}
          </Button>
        }
      />

      <Card>
        {isLoading && <LoadingState />}
        {suitesQuery.isError && <ErrorState onRetry={suitesQuery.refetch} />}
        {!isLoading && !suitesQuery.isError && suites.length === 0 && (
          <EmptyState message={t('testSuites.emptyState')} />
        )}
        {!isLoading && !suitesQuery.isError && suites.length > 0 && (
          <>
            <div className={styles.filters}>
              <SearchBar value={search} onChange={onSearchChange} />
              <Select
                label={t('requirements.title')}
                value={requirementFilter}
                onChange={setRequirementFilter}
                options={[
                  { value: ALL_REQUIREMENTS, label: t('common.all') },
                  ...requirements.map((req) => ({ value: req._id, label: req.title })),
                ]}
              />
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
                        onClick={() => viewSuite(row)}
                      >
                        {row.name}
                      </button>
                    ),
                  },
                  {
                    key: 'requirementId',
                    header: t('requirements.title'),
                    render: (row) => {
                      const requirement = requirementById[row.requirementId];
                      return requirement ? (
                        <button
                          type="button"
                          className={styles.requirementLink}
                          onClick={() => navigate(`/projects/${projectId}/requirements`)}
                        >
                          <Badge tone="info">{requirement.code}</Badge>
                        </button>
                      ) : (
                        '—'
                      );
                    },
                  },
                  { key: 'description', header: t('common.description') },
                  {
                    key: 'testCaseCount',
                    header: t('nav.testCases'),
                    render: (row) => testCaseCountBySuiteId[row._id] || 0,
                  },
                  {
                    key: 'actions',
                    header: t('common.actions'),
                    render: (row) => (
                      <RowActionsMenu
                        actions={[
                          { label: t('requirements.view'), onClick: () => viewSuite(row) },
                          { label: t('common.edit'), onClick: () => openEdit(row) },
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
        title={t('testSuites.createTitle')}
        onClose={() => setIsCreateOpen(false)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <Combobox
            label={t('requirements.title')}
            value={requirementSearch}
            onChange={handleRequirementSearchChange}
            required
            placeholder={t('testSuites.selectRequirement')}
            options={requirements.map((req) => ({ value: req._id, label: req.title }))}
          />
          <TextField label={t('common.name')} value={name} onChange={setName} required />
          <TextField
            label={t('common.description')}
            value={description}
            onChange={setDescription}
            as="textarea"
          />
          <Button type="submit" disabled={!createRequirementId || createMutation.isPending}>
            {t('common.create')}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingSuite)}
        title={t('testSuites.editTitle')}
        onClose={() => setEditingSuite(null)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.mutate();
          }}
        >
          <TextField label={t('common.name')} value={editName} onChange={setEditName} required />
          <TextField
            label={t('common.description')}
            value={editDescription}
            onChange={setEditDescription}
            as="textarea"
          />
          <Button type="submit" disabled={updateMutation.isPending}>
            {t('common.save')}
          </Button>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deletingSuite)}
        title={t('common.delete')}
        message={t('testSuites.confirmDeleteWithCases')}
        onCancel={() => setDeletingSuite(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />
    </div>
  );
}
