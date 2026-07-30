import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { testSuitesApi, testCasesApi, requirementsApi } from '../api/qaCore.api';
import { modulesApi } from '../api/projects.api';
import { parseSpreadsheetFile, downloadSpreadsheetRows } from '../utils/spreadsheet';
import { parseStepsText, serializeSteps } from '../utils/testCaseSteps';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Select } from '../components/Select';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { Table } from '../components/Table';
import { Dropzone } from '../components/Dropzone';
import { ExpandableText } from '../components/ExpandableText';
import styles from './ExcelTransformerPage.module.css';

const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['draft', 'active', 'deprecated'];
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

// Every field the transformer can fill on a TestCase, and the mapping key
// used to look each one up in the uploaded file's rows — the same "test
// case format" the Create/Edit Test Case form uses. Suite itself isn't
// here: every imported row goes into the single suite chosen above the
// upload, not a per-row mapping. Title is the only field that blocks
// import when unmapped; everything else falls back to a sensible default,
// same as the existing Kualitee-style CSV importer.
const TARGET_FIELDS = [
  { key: 'testCaseId', labelKey: 'excelTransformer.fieldTestCaseId' },
  { key: 'build', labelKey: 'excelTransformer.fieldBuild' },
  { key: 'title', labelKey: 'excelTransformer.fieldTitle', required: true },
  { key: 'summary', labelKey: 'excelTransformer.fieldSummary' },
  { key: 'status', labelKey: 'excelTransformer.fieldStatus' },
  { key: 'priority', labelKey: 'excelTransformer.fieldPriority' },
  { key: 'executionType', labelKey: 'excelTransformer.fieldExecutionType' },
  { key: 'testingType', labelKey: 'excelTransformer.fieldTestingType' },
  { key: 'preconditions', labelKey: 'excelTransformer.fieldPreconditions' },
  { key: 'steps', labelKey: 'excelTransformer.fieldSteps' },
  { key: 'expectedResult', labelKey: 'excelTransformer.fieldExpectedResult' },
  { key: 'actualResult', labelKey: 'excelTransformer.fieldActualResult' },
  { key: 'comments', labelKey: 'excelTransformer.fieldComments' },
];

// Exact column names/order Kualitee's own import template expects — not
// our internal "test case format" (TARGET_FIELDS above), a fixed external
// contract, so these strings must match verbatim.
const KUALITEE_HEADERS = [
  'Build',
  'Module',
  'Test Scenario Name',
  'Test Scenario Summary',
  'Test Case ID',
  'Test Case Summary',
  'Priority',
  'Execution Type',
  'Testing Type',
  'Pre-Conditions',
  'Detailed Steps',
  'Post Conditions',
  'Expected Result',
  'Requirement Title',
  'Requirement Summary',
  'Sub TestCase Detailed Steps 1',
  'Sub TestCase Expected Result 1',
];

function normalizeEnum(value, allowed, fallback) {
  const match = allowed.find(
    (option) =>
      option.toLowerCase() ===
      String(value || '')
        .trim()
        .toLowerCase(),
  );
  return match || fallback;
}

function sanitizeFilename(name) {
  const cleaned = (name || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'export';
}

// Two directions, one screen: Import brings a spreadsheet in *any* shape
// into our format (column mapping, defaults for anything unmapped).
// Export goes the other way — takes one of our suites back out as a
// spreadsheet in *Kualitee's exact* shape, for teams that keep editing
// their cases in Kualitee's own template.
export function ExcelTransformerPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState('import'); // 'import' | 'export'

  // ---- Import ----
  const [suiteId, setSuiteId] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null); // { headers, records }
  const [parseError, setParseError] = useState('');
  const [mapping, setMapping] = useState({});
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // ---- Export ----
  const [exportSuiteId, setExportSuiteId] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const suitesQuery = useQuery({
    queryKey: ['testSuites', 'project', projectId],
    queryFn: () => testSuitesApi.list({ projectId }),
  });
  const suites = suitesQuery.data?.testSuites || [];

  const requirementsQuery = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => requirementsApi.list(projectId),
    enabled: mode === 'export',
  });
  const requirements = requirementsQuery.data?.requirements || [];

  const modulesQuery = useQuery({
    queryKey: ['modules', projectId],
    queryFn: () => modulesApi.list(projectId),
    enabled: mode === 'export',
  });
  const moduleNameById = Object.fromEntries(
    (modulesQuery.data?.modules || []).map((module) => [module._id, module.name]),
  );

  const exportTestCasesQuery = useQuery({
    queryKey: ['testCases', projectId, 'suite', exportSuiteId],
    queryFn: () => testCasesApi.list({ projectId, suiteId: exportSuiteId }),
    enabled: mode === 'export' && Boolean(exportSuiteId),
  });
  const exportTestCases = exportTestCasesQuery.data?.testCases || [];

  function resetUpload() {
    setFileName('');
    setParsed(null);
    setParseError('');
    setMapping({});
    setImportResult(null);
  }

  async function handleFile(file) {
    setParseError('');
    try {
      const result = await parseSpreadsheetFile(file);
      if (result.headers.length === 0) {
        setParseError(t('excelTransformer.emptyFile'));
        return;
      }
      setFileName(file.name);
      setParsed(result);
      setMapping({});
      setImportResult(null);
    } catch {
      setParseError(t('excelTransformer.parseError'));
    }
  }

  function getMappedValue(record, key) {
    const header = mapping[key];
    return header ? (record[header] || '').trim() : '';
  }

  // Once a column is mapped to one field, it drops out of every other
  // field's options — a column only means one thing at a time, so seeing
  // it offered twice would just invite a mistake. The field's own current
  // pick stays in its own list so re-opening the dropdown doesn't lose it.
  function availableHeadersFor(fieldKey) {
    const usedElsewhere = new Set(
      Object.entries(mapping)
        .filter(([key, value]) => key !== fieldKey && value)
        .map(([, value]) => value),
    );
    return parsed.headers.filter((header) => !usedElsewhere.has(header));
  }

  const previewRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.records.map((record) =>
      Object.fromEntries(
        TARGET_FIELDS.map((field) => [field.key, getMappedValue(record, field.key)]),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, mapping]);

  const canImport = Boolean(suiteId && parsed && mapping.title);

  async function handleImport() {
    setIsImporting(true);
    setImportResult(null);
    try {
      const failures = [];
      let successCount = 0;

      for (let index = 0; index < parsed.records.length; index += 1) {
        const record = parsed.records[index];
        const rowNumber = index + 2; // header row + 0-index
        const title = getMappedValue(record, 'title');

        if (!title) {
          failures.push({
            row: rowNumber,
            title: '(sin título)',
            reason: t('excelTransformer.missingRequiredCell'),
          });
          continue;
        }

        try {
          await testCasesApi.create({
            projectId,
            suiteId,
            title,
            testCaseId: getMappedValue(record, 'testCaseId'),
            summary: getMappedValue(record, 'summary'),
            build: getMappedValue(record, 'build'),
            status: normalizeEnum(getMappedValue(record, 'status'), STATUSES, 'active'),
            // Not part of the mapped column set — same default the Create
            // Test Case form uses when left untouched.
            automationUi: false,
            automationApi: false,
            priority: normalizeEnum(getMappedValue(record, 'priority'), PRIORITIES, 'medium'),
            executionType: normalizeEnum(
              getMappedValue(record, 'executionType'),
              EXECUTION_TYPES,
              'manual',
            ),
            testingType: normalizeEnum(
              getMappedValue(record, 'testingType'),
              TESTING_TYPES,
              'functional',
            ),
            preconditions: getMappedValue(record, 'preconditions'),
            steps: parseStepsText(getMappedValue(record, 'steps')),
            expectedResult: getMappedValue(record, 'expectedResult'),
            actualResult: getMappedValue(record, 'actualResult'),
            comments: getMappedValue(record, 'comments'),
          });
          successCount += 1;
        } catch (err) {
          failures.push({ row: rowNumber, title, reason: err.message });
        }
      }

      setImportResult({ successCount, failures });
      if (successCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['testCases', projectId] });
      }
    } finally {
      setIsImporting(false);
    }
  }

  function handleExportKualitee() {
    setIsExporting(true);
    try {
      const suite = suites.find((candidate) => candidate._id === exportSuiteId);
      const requirement = requirements.find((candidate) => candidate._id === suite?.requirementId);

      const rows = exportTestCases.map((testCase) => [
        testCase.build || '',
        moduleNameById[testCase.moduleId] || '',
        suite?.name || '',
        suite?.description || '',
        // The case's own imported/external identifier — blank for cases
        // that predate this field, never our internally-assigned code.
        testCase.testCaseId || '',
        testCase.title || '',
        testCase.priority || '',
        testCase.executionType || '',
        testCase.testingType || '',
        testCase.preconditions || '',
        serializeSteps(testCase.steps || []),
        testCase.postconditions || '',
        testCase.expectedResult || '',
        requirement?.title || '',
        requirement?.description || '',
        // No Scenario/Sub-TestCase hierarchy in this app — kept blank so
        // the column layout still matches Kualitee's template.
        '',
        '',
      ]);

      downloadSpreadsheetRows(
        `${sanitizeFilename(suite?.name)}-kualitee.xlsx`,
        KUALITEE_HEADERS,
        rows,
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div>
      <PageHeader title={t('excelTransformer.title')} />

      <Card>
        <div className={styles.modeToggle}>
          <Button
            type="button"
            variant={mode === 'import' ? 'primary' : 'secondary'}
            onClick={() => setMode('import')}
          >
            {t('excelTransformer.importModeLabel')}
          </Button>
          <Button
            type="button"
            variant={mode === 'export' ? 'primary' : 'secondary'}
            onClick={() => setMode('export')}
          >
            {t('excelTransformer.exportModeLabel')}
          </Button>
        </div>

        {mode === 'import' && (
          <>
            <p className={styles.intro}>{t('excelTransformer.intro')}</p>

            <div className={styles.fieldGrid}>
              <Select
                label={t('excelTransformer.suiteLabel')}
                value={suiteId}
                onChange={(value) => {
                  setSuiteId(value);
                  resetUpload();
                }}
                required
                options={[
                  { value: '', label: t('testSuites.selectSuite') },
                  ...suites.map((suite) => ({ value: suite._id, label: suite.name })),
                ]}
              />
            </div>

            {!suiteId && <p className={styles.hint}>{t('excelTransformer.pickSuiteHint')}</p>}

            {suiteId && !parsed && (
              <Dropzone
                hint={t('excelTransformer.uploadHint')}
                accept=".csv,text/csv,.txt,text/plain,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onFiles={(files) => handleFile(files[0])}
              />
            )}

            {parseError && <p className={styles.warning}>{parseError}</p>}

            {parsed && !importResult && (
              <>
                <div className={styles.fileRow}>
                  <Badge>{fileName}</Badge>
                  <Button variant="secondary" onClick={resetUpload}>
                    {t('excelTransformer.changeFile')}
                  </Button>
                </div>

                <h3 className={styles.sectionTitle}>{t('excelTransformer.mappingTitle')}</h3>
                <p className={styles.hint}>{t('excelTransformer.mappingHint')}</p>
                <div className={styles.mappingGrid}>
                  {TARGET_FIELDS.map((field) => (
                    <Select
                      key={field.key}
                      label={t(field.labelKey)}
                      value={mapping[field.key] || ''}
                      onChange={(value) =>
                        setMapping((current) => ({ ...current, [field.key]: value }))
                      }
                      options={[
                        { value: '', label: t('excelTransformer.notMapped') },
                        ...availableHeadersFor(field.key).map((header) => ({
                          value: header,
                          label: header,
                        })),
                      ]}
                    />
                  ))}
                </div>

                <h3 className={styles.sectionTitle}>
                  {t('excelTransformer.previewTitle', { count: previewRows.length })}
                </h3>
                <div className={styles.previewWrapper}>
                  <Table
                    columns={TARGET_FIELDS.map((field) => ({
                      key: field.key,
                      header: t(field.labelKey),
                      render: (row) => (
                        <ExpandableText text={row[field.key]} label={t(field.labelKey)} />
                      ),
                    }))}
                    rows={previewRows}
                    getRowKey={(_row, index) => index}
                  />
                </div>

                {!canImport && (
                  <p className={styles.warning}>{t('excelTransformer.requiredMappingHint')}</p>
                )}

                <div className={styles.actions}>
                  <Button disabled={!canImport || isImporting} onClick={handleImport}>
                    {isImporting
                      ? t('excelTransformer.importing')
                      : t('excelTransformer.importButton', { count: parsed.records.length })}
                  </Button>
                </div>
              </>
            )}

            {importResult && (
              <div className={styles.resultBox}>
                <p>
                  {t('excelTransformer.importSummary', {
                    success: importResult.successCount,
                    failed: importResult.failures.length,
                  })}
                </p>
                {importResult.failures.length > 0 && (
                  <ul className={styles.failureList}>
                    {importResult.failures.map((failure, index) => (
                      <li key={index}>
                        {t('excelTransformer.importFailureRow', {
                          row: failure.row,
                          title: failure.title,
                        })}{' '}
                        — {failure.reason}
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="secondary" onClick={resetUpload}>
                  {t('excelTransformer.startOver')}
                </Button>
              </div>
            )}
          </>
        )}

        {mode === 'export' && (
          <>
            <p className={styles.intro}>{t('excelTransformer.exportIntro')}</p>

            <div className={styles.fieldGrid}>
              <Select
                label={t('excelTransformer.exportSuiteLabel')}
                value={exportSuiteId}
                onChange={setExportSuiteId}
                required
                options={[
                  { value: '', label: t('testSuites.selectSuite') },
                  ...suites.map((suite) => ({ value: suite._id, label: suite.name })),
                ]}
              />
            </div>

            {!exportSuiteId && (
              <p className={styles.hint}>{t('excelTransformer.exportPickSuiteHint')}</p>
            )}

            {exportSuiteId && (
              <p className={styles.hint}>
                {exportTestCasesQuery.isLoading
                  ? t('common.loading')
                  : t('excelTransformer.exportCaseCount', { count: exportTestCases.length })}
              </p>
            )}

            <div className={styles.actions}>
              <Button
                disabled={!exportSuiteId || exportTestCases.length === 0 || isExporting}
                onClick={handleExportKualitee}
              >
                {isExporting ? t('excelTransformer.exporting') : t('excelTransformer.exportButton')}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
