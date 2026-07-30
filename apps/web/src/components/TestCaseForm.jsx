import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from './TextField';
import { Select } from './Select';
import { Button } from './Button';
import { NumberedTextArea } from './NumberedTextArea';
import { serializeSteps, parseStepsText } from '../utils/testCaseSteps';
import styles from './TestCaseForm.module.css';

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

// requirements: [{ _id, title }], testSuites: [{ _id, name, requirementId }]
// (every suite for the project — requirements is only used to label each
// suite option with its requirement's title, since there's no separate
// Requirement picker: a case relates to a suite, and a suite already
// belongs to exactly one requirement).
// No required props: renders (and degrades gracefully) with empty lists.
//
// No template/custom-fields picker here — that's a separately-configurable
// feature (Test Case Templates module) whose per-project default template
// (e.g. "Evidencia") kept reintroducing fields this form explicitly doesn't
// want, so it's cut entirely; createTestCase falls back to the project's
// default template server-side when none is sent.
//
// testCase: pass an existing test case to switch the form into edit mode —
// every field is prefilled from it and the submit button reads "Save"
// instead of "Create". Suite stays read-only in edit mode: the case-to-suite
// relationship is set once at creation (same rule updateTestCase enforces
// server-side — it doesn't accept suiteId at all).
export function TestCaseForm({
  requirements = [],
  testSuites = [],
  initialSuiteId = '',
  testCase = null,
  onSubmit = () => {},
  submitting = false,
}) {
  const { t } = useTranslation();
  const isEditMode = Boolean(testCase);

  // Información general
  const [title, setTitle] = useState(testCase?.title || '');
  // Separate from our own auto-assigned `code` (TC-006, ...) — this is the
  // identifier from wherever the case originally came from (a Kualitee
  // export, an existing spreadsheet), imported as-is via the Excel
  // Transformer, editable here too for cases entered by hand.
  const [testCaseId, setTestCaseId] = useState(testCase?.testCaseId || '');
  const [build, setBuild] = useState(testCase?.build || '');
  const [summary, setSummary] = useState(testCase?.summary || '');
  // New cases default to Active, not Draft — most cases created here are
  // ready to run right away, not a work-in-progress draft.
  const [status, setStatus] = useState(testCase?.status || 'active');
  const [priority, setPriority] = useState(testCase?.priority || 'medium');
  const [executionType, setExecutionType] = useState(testCase?.executionType || 'manual');
  const [testingType, setTestingType] = useState(testCase?.testingType || 'functional');

  // Información adicional — just the Suite relationship now, no separate
  // Requirement picker: a suite already belongs to exactly one requirement,
  // so picking the suite is enough (its label below shows the requirement
  // for context). Every other "additional info" field (build, module,
  // estimated time, assignee, scenario name/summary) was cut from this form
  // per explicit request. The fields themselves still exist on TestCase for
  // whatever already has values (execution drawer, PDF report still show
  // them).
  const [suiteId, setSuiteId] = useState(testCase?.suiteId || initialSuiteId);
  // Independent of executionType (which is "how it's run today") — a case
  // can have UI and/or API automation regardless of that.
  const [automationUi, setAutomationUi] = useState(Boolean(testCase?.automationUi));
  const [automationApi, setAutomationApi] = useState(Boolean(testCase?.automationApi));

  // Precondiciones / Pasos / Resultado esperado / Resultado obtenido /
  // Comentarios. No Postcondiciones, no Evidencia — cut per explicit
  // request: cases don't carry evidence, only their executions (in a
  // cycle) do.
  const [preconditions, setPreconditions] = useState(testCase?.preconditions || '');
  // A single numbered free-text field, not a repeater of action/expected
  // pairs — type, press Enter for the next step. Existing per-step
  // expectedResult values (from before this change) aren't shown here;
  // only the action text is.
  const [stepsText, setStepsText] = useState(() => serializeSteps(testCase?.steps));
  const [expectedResult, setExpectedResult] = useState(testCase?.expectedResult || '');
  const [actualResult, setActualResult] = useState(testCase?.actualResult || '');
  const [comments, setComments] = useState(testCase?.comments || '');

  // Every suite in the project, labeled with its requirement for context —
  // there's no separate Requirement picker anymore, since a suite already
  // implies exactly one requirement.
  const suiteOptions = useMemo(
    () =>
      testSuites.map((suite) => {
        const requirement = requirements.find((req) => req._id === suite.requirementId);
        return {
          value: suite._id,
          label: requirement ? `${requirement.title} / ${suite.name}` : suite.name,
        };
      }),
    [testSuites, requirements],
  );

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      title,
      testCaseId,
      build,
      summary,
      status,
      priority,
      executionType,
      testingType,
      suiteId,
      automationUi,
      automationApi,
      preconditions,
      steps: parseStepsText(stepsText),
      expectedResult,
      actualResult,
      comments,
    });
  }

  return (
    <form onSubmit={handleSubmit} data-testid="test-case-form" className={styles.form}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('testCases.sectionGeneral')}</h3>
        <TextField label={t('testCases.titleField')} value={title} onChange={setTitle} required />
        <TextField
          label={t('testCases.summary')}
          value={summary}
          onChange={setSummary}
          as="textarea"
        />
        <div className={styles.fieldGrid}>
          <TextField
            label={t('testCases.testCaseId')}
            value={testCaseId}
            onChange={setTestCaseId}
          />
          <TextField label={t('testCases.build')} value={build} onChange={setBuild} />
          <Select
            label={t('common.status')}
            value={status}
            onChange={setStatus}
            options={STATUSES.map((value) => ({ value, label: t(`testCases.status_${value}`) }))}
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
          <Select
            label={t('testCases.executionType')}
            value={executionType}
            onChange={setExecutionType}
            options={EXECUTION_TYPES.map((value) => ({
              value,
              label: t(`testCases.executionType_${value}`),
            }))}
          />
          <Select
            label={t('testCases.testingType')}
            value={testingType}
            onChange={setTestingType}
            options={TESTING_TYPES.map((value) => ({
              value,
              label: t(`testCases.testingType_${value}`),
            }))}
          />
          <Select
            label={t('testSuites.title')}
            value={suiteId}
            onChange={setSuiteId}
            required
            disabled={isEditMode}
            options={[{ value: '', label: t('testSuites.selectSuite') }, ...suiteOptions]}
          />
        </div>
        <p className={styles.subLabel}>{t('testCases.automation')}</p>
        <div className={styles.fieldGrid}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={automationUi}
              onChange={(event) => setAutomationUi(event.target.checked)}
            />
            {t('testCases.automationUi')}
          </label>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={automationApi}
              onChange={(event) => setAutomationApi(event.target.checked)}
            />
            {t('testCases.automationApi')}
          </label>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('testCases.preconditions')}</h3>
        <TextField value={preconditions} onChange={setPreconditions} as="textarea" rows={5} />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('testCases.steps')}</h3>
        <NumberedTextArea
          value={stepsText}
          onChange={setStepsText}
          placeholder={t('testCases.stepsPlaceholder')}
        />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('testCases.sectionExpectedResult')}</h3>
        <TextField value={expectedResult} onChange={setExpectedResult} as="textarea" rows={4} />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('testCases.actualResult')}</h3>
        <TextField value={actualResult} onChange={setActualResult} as="textarea" rows={4} />
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('testCases.comments')}</h3>
        <TextField value={comments} onChange={setComments} as="textarea" rows={4} />
      </section>

      <div className={styles.submitRow}>
        <Button type="submit" disabled={submitting}>
          {isEditMode ? t('common.save') : t('common.create')}
        </Button>
      </div>
    </form>
  );
}
