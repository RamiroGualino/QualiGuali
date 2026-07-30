import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { testCasesApi, requirementsApi, testSuitesApi } from '../api/qaCore.api';
import { modulesApi } from '../api/projects.api';
import { useSearchAndPaginate } from '../hooks/useSearchAndPaginate';
import { codeNumber } from '../utils/executions';
import { downloadSpreadsheetRows, parseSpreadsheetFile } from '../utils/spreadsheet';
import { serializeSteps, parseStepsText } from '../utils/testCaseSteps';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { KpiCard } from '../components/KpiCard';
import { ProgressBar } from '../components/ProgressBar';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { ConfirmModal } from '../components/ConfirmModal';
import { Select } from '../components/Select';
import { Table } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { SearchBar } from '../components/SearchBar';
import { Pagination } from '../components/Pagination';
import { Dropzone } from '../components/Dropzone';
import { TestCaseForm } from '../components/TestCaseForm';
import { ExpandableText } from '../components/ExpandableText';
import { LoadingState, ErrorState, EmptyState } from '../components/QueryStates';
import styles from './TestCasesPage.module.css';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const EXECUTION_TYPES = ['manual', 'automated'];
const TESTING_TYPES = [
  'functional',
  'regression',
  'smoke',
  'integration',
  'uat',
  'performance',
  'security',
  'other',
];
const SEARCH_FIELDS = ['code', 'title'];
// Stable reference so the `|| []` fallback doesn't invalidate the useMemo
// below on every render.
const EMPTY_ARRAY = [];

// Fixed column set/order shared by export and import so a round trip
// through Excel stays compatible — matches the Kualitee template exactly.
// "Sub TestCase" columns are kept (for template compatibility) but unused:
// this app has no Scenario/Sub-TestCase hierarchy, only Requirement -> Suite
// -> TestCase, so there's nothing to fill them with.
const REQUIRED_IMPORT_HEADERS = ['Test Case Summary', 'Requirement Title', 'Test Scenario Name'];

function normalizeEnum(value, allowed, fallback) {
  const match = allowed.find(
    (option) => option.toLowerCase() === String(value || '').toLowerCase(),
  );
  return match || fallback;
}

function parseYesNo(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase() === 'yes'
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.83l-1.17-1.17a2 2 0 0 0-2.83 0L4 16v4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <path
        d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TestCasesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const queryClient = useQueryClient();
  // URL-driven (not just local state) so a deep link — e.g. Test Suites'
  // "view" action — and this page's own Suite filter share the same state.
  const [searchParams, setSearchParams] = useSearchParams();
  const suiteIdFilter = searchParams.get('suiteId') || '';
  const [requirementFilter, setRequirementFilter] = useState('');

  function setSuiteIdFilter(suiteId) {
    setSearchParams(suiteId ? { suiteId } : {});
  }

  // Changing the Requirement filter away from the current suite's own
  // requirement would leave an inconsistent combination (a suite filter
  // that can never match) — clear it instead.
  function handleRequirementFilterChange(nextRequirementId) {
    setRequirementFilter(nextRequirementId);
    if (
      suiteIdFilter &&
      nextRequirementId &&
      suiteIdToRequirementId[suiteIdFilter] !== nextRequirementId
    ) {
      setSuiteIdFilter('');
    }
  }

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTestCase, setEditingTestCase] = useState(null);
  const [deletingTestCase, setDeletingTestCase] = useState(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Always the full project — suite/requirement filtering both happen
  // client-side below (see requirementFilteredCases) so that filtering down
  // to zero results doesn't hide the filter controls themselves (the empty
  // state below this needs to reflect "this project has no test cases",
  // not "this filter combination has none").
  const testCasesQuery = useQuery({
    queryKey: ['testCases', projectId],
    queryFn: () => testCasesApi.list({ projectId }),
  });

  const modulesQuery = useQuery({
    queryKey: ['modules', projectId],
    queryFn: () => modulesApi.list(projectId),
  });

  const requirementsQuery = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => requirementsApi.list(projectId),
  });

  const suitesQuery = useQuery({
    queryKey: ['testSuites', 'project', projectId],
    queryFn: () => testSuitesApi.list({ projectId }),
  });

  const createMutation = useMutation({
    mutationFn: (values) => testCasesApi.create({ projectId, ...values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testCases', projectId] });
      setIsCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values) => testCasesApi.update(editingTestCase._id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testCases', projectId] });
      setEditingTestCase(null);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => testCasesApi.remove(deletingTestCase._id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['testCases', projectId] });
      setDeletingTestCase(null);
    },
  });

  const testCases = testCasesQuery.data?.testCases || EMPTY_ARRAY;
  const requirements = requirementsQuery.data?.requirements || [];
  const testSuites = suitesQuery.data?.testSuites || [];
  const modules = modulesQuery.data?.modules || EMPTY_ARRAY;
  const suiteNameById = Object.fromEntries(testSuites.map((suite) => [suite._id, suite.name]));
  const suiteIdToRequirementId = Object.fromEntries(
    testSuites.map((suite) => [suite._id, suite.requirementId]),
  );
  const requirementById = Object.fromEntries(requirements.map((req) => [req._id, req]));
  const moduleNameById = Object.fromEntries(modules.map((module) => [module._id, module.name]));

  // Requirement/Suite filtering are both client-side (like the search
  // below) — the dataset here is small, and TestCase only has suiteId, not
  // requirementId, directly, so Requirement filtering is a join through
  // testSuites either way.
  // Sorted by the case's own Test Case ID (numeric part, "TC-9" before
  // "TC-10") rather than left in whatever order the API returned — that's
  // the order testers actually recognize their cases by. Cases without one
  // (never imported/assigned) sort last instead of breaking the order.
  const requirementFilteredCases = testCases
    .filter((testCase) =>
      requirementFilter ? suiteIdToRequirementId[testCase.suiteId] === requirementFilter : true,
    )
    .filter((testCase) => (suiteIdFilter ? testCase.suiteId === suiteIdFilter : true))
    .sort((a, b) => codeNumber(a.testCaseId) - codeNumber(b.testCaseId));

  // The Suite filter's own option list narrows to the chosen Requirement,
  // same cascading behavior as the create/edit form.
  const suitesForFilter = requirementFilter
    ? testSuites.filter((suite) => suite.requirementId === requirementFilter)
    : testSuites;

  const {
    search,
    onSearchChange,
    page,
    pageSize,
    totalItems,
    onPageChange,
    onPageSizeChange,
    pageItems,
    filteredItems,
  } = useSearchAndPaginate(requirementFilteredCases, SEARCH_FIELDS);

  // Derived from filteredItems (post search + requirement filter), not the
  // raw testCases list, so the stats update live as those filters change.
  const kpis = useMemo(() => {
    const total = filteredItems.length;
    const approved = filteredItems.filter((testCase) => testCase.status === 'active').length;
    const pending = filteredItems.filter((testCase) => testCase.status === 'draft').length;
    return {
      total,
      approved,
      pending,
      approvedPercent: total > 0 ? Math.round((approved / total) * 100) : 0,
      pendingPercent: total > 0 ? Math.round((pending / total) * 100) : 0,
    };
  }, [filteredItems]);

  // Fixed 19-column layout: the first 17 match the Kualitee-style template
  // exactly, plus 2 QualiGuali-specific "Automation UI"/"Automation API"
  // columns appended at the end (Yes/No) so they round-trip too —
  // importTestCasesFile below reads the same header names, so a file
  // exported here re-imports without any manual remapping.
  function exportSpreadsheet() {
    const columns = [
      { key: 'build', header: 'Build', get: (row) => row.build || '' },
      { key: 'module', header: 'Module', get: (row) => moduleNameById[row.moduleId] || '' },
      // The template has no separate "Suite" column, so this one does
      // double duty: it's the Suite's own name (not the optional
      // scenarioName field), so importTestCasesFile can always resolve
      // the same suite back on re-import, even for cases created before
      // scenarioName existed.
      {
        key: 'scenarioName',
        header: 'Test Scenario Name',
        get: (row) => suiteNameById[row.suiteId] || '',
      },
      {
        key: 'scenarioSummary',
        header: 'Test Scenario Summary',
        get: (row) => row.scenarioSummary || '',
      },
      {
        key: 'testCaseId',
        header: 'Test Case ID',
        get: (row) => row.testCaseId || '',
      },
      { key: 'title', header: 'Test Case Summary' },
      { key: 'priority', header: 'Priority' },
      { key: 'executionType', header: 'Execution Type' },
      { key: 'testingType', header: 'Testing Type' },
      { key: 'preconditions', header: 'Pre-Conditions', get: (row) => row.preconditions || '' },
      { key: 'steps', header: 'Detailed Steps', get: (row) => serializeSteps(row.steps || []) },
      {
        key: 'postconditions',
        header: 'Post Conditions',
        get: (row) => row.postconditions || '',
      },
      {
        key: 'expectedResult',
        header: 'Expected Result',
        get: (row) => row.expectedResult || '',
      },
      {
        key: 'requirementTitle',
        header: 'Requirement Title',
        get: (row) => requirementById[suiteIdToRequirementId[row.suiteId]]?.title || '',
      },
      {
        key: 'requirementSummary',
        header: 'Requirement Summary',
        get: (row) => requirementById[suiteIdToRequirementId[row.suiteId]]?.description || '',
      },
      // No Scenario/Sub-TestCase hierarchy in this app — kept blank so the
      // column layout still matches the template.
      { key: 'subSteps', header: 'Sub TestCase Detailed Steps', get: () => '' },
      { key: 'subExpectedResult', header: 'Sub TestCase Expected Result', get: () => '' },
      {
        key: 'automationUi',
        header: 'Automation UI',
        get: (row) => (row.automationUi ? 'Yes' : 'No'),
      },
      {
        key: 'automationApi',
        header: 'Automation API',
        get: (row) => (row.automationApi ? 'Yes' : 'No'),
      },
    ];
    downloadSpreadsheetRows(
      `test-cases-${projectId}.xlsx`,
      columns.map((column) => column.header),
      filteredItems.map((row) =>
        columns.map((column) => (column.get ? column.get(row) : (row[column.key] ?? ''))),
      ),
    );
  }

  // Resolves each row against existing Requirements/Suites/Modules (never
  // creates them) and creates test cases one at a time through the same
  // existing POST /test-cases endpoint the form uses — no new backend
  // endpoint for bulk import.
  async function importTestCasesFile(file) {
    setIsImporting(true);
    setImportResult(null);
    try {
      const { headers, records } = await parseSpreadsheetFile(file);

      const missingHeaders = REQUIRED_IMPORT_HEADERS.filter((header) => !headers.includes(header));
      if (missingHeaders.length > 0) {
        setImportResult({ missingHeaders, successCount: 0, failures: [] });
        return;
      }

      const successes = [];
      const failures = [];

      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        const rowNumber = index + 2; // +1 for 0-index, +1 for the header row
        const title = record['Test Case Summary']?.trim();
        const requirementTitle = record['Requirement Title']?.trim();
        const scenarioName = record['Test Scenario Name']?.trim();

        if (!title || !requirementTitle || !scenarioName) {
          failures.push({
            row: rowNumber,
            title: title || '(sin título)',
            reason: t('testCases.importMissingRequiredCell'),
          });
          continue;
        }

        const requirement = requirements.find((req) => req.title === requirementTitle);
        if (!requirement) {
          failures.push({
            row: rowNumber,
            title,
            reason: t('testCases.importRequirementNotFound', { title: requirementTitle }),
          });
          continue;
        }

        const suite = testSuites.find(
          (candidate) =>
            candidate.requirementId === requirement._id && candidate.name === scenarioName,
        );
        if (!suite) {
          failures.push({
            row: rowNumber,
            title,
            reason: t('testCases.importSuiteNotFound', { name: scenarioName }),
          });
          continue;
        }

        const matchedModule = modules.find(
          (candidate) => candidate.name === record['Module']?.trim(),
        );

        try {
          await testCasesApi.create({
            projectId,
            suiteId: suite._id,
            moduleId: matchedModule?._id,
            title,
            testCaseId: record['Test Case ID'] || '',
            build: record['Build'] || '',
            scenarioName,
            scenarioSummary: record['Test Scenario Summary'] || '',
            priority: normalizeEnum(record['Priority'], PRIORITIES, 'medium'),
            executionType: normalizeEnum(record['Execution Type'], EXECUTION_TYPES, 'manual'),
            testingType: normalizeEnum(record['Testing Type'], TESTING_TYPES, 'functional'),
            preconditions: record['Pre-Conditions'] || '',
            steps: parseStepsText(record['Detailed Steps'] || ''),
            postconditions: record['Post Conditions'] || '',
            expectedResult: record['Expected Result'] || '',
            automationUi: parseYesNo(record['Automation UI']),
            automationApi: parseYesNo(record['Automation API']),
          });
          successes.push(title);
        } catch (err) {
          failures.push({ row: rowNumber, title, reason: err.message });
        }
      }

      setImportResult({ missingHeaders: [], successCount: successes.length, failures });
      if (successes.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['testCases', projectId] });
      }
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('testCases.title')}
        action={
          <div className={styles.headerActions}>
            <Button
              variant="secondary"
              onClick={() => {
                setImportResult(null);
                setIsImportOpen(true);
              }}
            >
              {t('testCases.import')}
            </Button>
            <Button
              variant="secondary"
              onClick={exportSpreadsheet}
              disabled={filteredItems.length === 0}
            >
              {t('testCases.export')}
            </Button>
            <Button onClick={() => setIsCreateOpen(true)}>{t('testCases.createButton')}</Button>
          </div>
        }
      />

      <Card>
        {testCasesQuery.isLoading && <LoadingState />}
        {testCasesQuery.isError && <ErrorState onRetry={testCasesQuery.refetch} />}
        {!testCasesQuery.isLoading && !testCasesQuery.isError && testCases.length === 0 && (
          <EmptyState message={t('testCases.emptyState')} />
        )}
        {!testCasesQuery.isLoading && !testCasesQuery.isError && testCases.length > 0 && (
          <>
            <div className={styles.filters}>
              <SearchBar value={search} onChange={onSearchChange} />
              <Select
                label={t('requirements.title')}
                value={requirementFilter}
                onChange={handleRequirementFilterChange}
                options={[
                  { value: '', label: t('common.all') },
                  ...requirements.map((requirement) => ({
                    value: requirement._id,
                    label: requirement.title,
                  })),
                ]}
              />
              <Select
                label={t('testSuites.title')}
                value={suiteIdFilter}
                onChange={setSuiteIdFilter}
                options={[
                  { value: '', label: t('common.all') },
                  ...suitesForFilter.map((suite) => ({ value: suite._id, label: suite.name })),
                ]}
              />
            </div>

            <Card className={styles.kpiCard}>
              <div className={styles.kpiRow}>
                <KpiCard label={t('testCases.totalKpi')} value={kpis.total} accent="info" />
                <KpiCard
                  label={t('testCases.approvedKpi')}
                  value={`${kpis.approvedPercent}%`}
                  accent="pass"
                  tone="pass"
                />
                <KpiCard
                  label={t('testCases.pendingKpi')}
                  value={`${kpis.pendingPercent}%`}
                  accent="warning"
                />
              </div>
              <ProgressBar
                percent={kpis.approvedPercent}
                label={String(kpis.total)}
                tone={kpis.approvedPercent > 0 ? 'pass' : 'neutral'}
              />
            </Card>

            {pageItems.length === 0 && <EmptyState message={t('common.noResults')} />}
            {pageItems.length > 0 && (
              <Table
                columns={[
                  {
                    key: 'testCaseId',
                    header: t('testCases.testCaseId'),
                    render: (row) => row.testCaseId || '—',
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
                    key: 'title',
                    header: t('testCases.titleField'),
                    render: (row) => (
                      <ExpandableText text={row.title} label={t('testCases.titleField')} />
                    ),
                  },
                  {
                    key: 'status',
                    header: t('common.status'),
                    render: (row) => (
                      <StatusBadge
                        status={row.status}
                        label={t(`testCases.status_${row.status}`)}
                      />
                    ),
                  },
                  {
                    key: 'summary',
                    header: t('testCases.summary'),
                    render: (row) => (
                      <ExpandableText text={row.summary} label={t('testCases.summary')} />
                    ),
                  },
                  {
                    key: 'expectedResult',
                    header: t('testCases.sectionExpectedResult'),
                    // emptyFallback="": most cases won't have this filled
                    // in, and a column full of "—" reads as noise, not
                    // information — a blank cell already says "no value".
                    render: (row) => (
                      <ExpandableText
                        text={row.expectedResult}
                        label={t('testCases.sectionExpectedResult')}
                        emptyFallback=""
                      />
                    ),
                  },
                  {
                    key: 'actions',
                    header: t('common.actions'),
                    render: (row) => (
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={styles.rowActionButton}
                          onClick={() => setEditingTestCase(row)}
                          aria-label={t('common.edit')}
                          title={t('common.edit')}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          className={[styles.rowActionButton, styles.rowActionDanger].join(' ')}
                          onClick={() => setDeletingTestCase(row)}
                          aria-label={t('common.delete')}
                          title={t('common.delete')}
                        >
                          <TrashIcon />
                        </button>
                      </div>
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
        title={t('testCases.createTitle')}
        onClose={() => setIsCreateOpen(false)}
        disableBackdropClose
        variant="drawer"
        drawerWidth="40vw"
      >
        <TestCaseForm
          requirements={requirements}
          testSuites={testSuites}
          initialSuiteId={suiteIdFilter}
          submitting={createMutation.isPending}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Modal>

      <Modal
        open={Boolean(editingTestCase)}
        title={t('testCases.editTitle')}
        onClose={() => setEditingTestCase(null)}
        disableBackdropClose
        variant="drawer"
        drawerWidth="40vw"
      >
        {editingTestCase && (
          <TestCaseForm
            testCase={editingTestCase}
            requirements={requirements}
            testSuites={testSuites}
            submitting={updateMutation.isPending}
            onSubmit={(values) => updateMutation.mutate(values)}
          />
        )}
      </Modal>

      <Modal
        open={isImportOpen}
        title={t('testCases.importTitle')}
        onClose={() => setIsImportOpen(false)}
      >
        {!importResult && (
          <>
            <p className={styles.importHint}>{t('testCases.importHint')}</p>
            <Dropzone
              hint={t('testCases.importDropHint')}
              accept=".xlsx,.xls,.csv,text/csv"
              onFiles={(files) => importTestCasesFile(files[0])}
            />
            {isImporting && <LoadingState />}
          </>
        )}

        {importResult && importResult.missingHeaders.length > 0 && (
          <p className={styles.importError}>
            {t('testCases.importMissingColumns', {
              columns: importResult.missingHeaders.join(', '),
            })}
          </p>
        )}

        {importResult && importResult.missingHeaders.length === 0 && (
          <>
            <p className={styles.importSummary}>
              {t('testCases.importSummary', {
                success: importResult.successCount,
                failed: importResult.failures.length,
              })}
            </p>
            {importResult.failures.length > 0 && (
              <ul className={styles.importFailureList}>
                {importResult.failures.map((failure) => (
                  <li key={failure.row}>
                    {t('testCases.importFailureRow', { row: failure.row, title: failure.title })}
                    {' — '}
                    {failure.reason}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {importResult && (
          <Button
            variant="secondary"
            onClick={() => {
              setImportResult(null);
            }}
          >
            {t('testCases.importAnotherFile')}
          </Button>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(deletingTestCase)}
        title={t('common.delete')}
        message={t('common.confirmDelete')}
        onCancel={() => setDeletingTestCase(null)}
        onConfirm={() => removeMutation.mutate()}
        isConfirming={removeMutation.isPending}
      />
    </div>
  );
}
