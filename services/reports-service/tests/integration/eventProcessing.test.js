jest.mock('../../src/clients/executionClient');
jest.mock('../../src/clients/qaCoreClient');

const testDb = require('../helpers/testDb');
const { domainEvent } = require('../helpers/token');
const executionClient = require('../../src/clients/executionClient');
const qaCoreClient = require('../../src/clients/qaCoreClient');
const { processEvent } = require('../../src/consumers/processEvent');
const CycleReport = require('../../src/models/CycleReport');
const TrendPoint = require('../../src/models/TrendPoint');
const FailedTest = require('../../src/models/FailedTest');
const ExecutionIndex = require('../../src/models/ExecutionIndex');
const Notification = require('../../src/models/Notification');

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('ExecutionUpdated', () => {
  test('resolves projectId from execution-service the first time a cycle is seen', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });

    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        testCaseId: 'tc-1',
        status: 'pass',
      }),
    );

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report.projectId).toBe('proj-1');
    expect(report).toMatchObject({ totalManual: 1, passedManual: 1, failedManual: 0 });
    expect(executionClient.getExecutionCycle).toHaveBeenCalledTimes(1);
  });

  test('a second execution in the same cycle reuses the local projectId (no extra lookup)', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });

    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'pass',
      }),
    );
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-2',
        cycleId: 'cycle-1',
        status: 'fail',
      }),
    );

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report).toMatchObject({ totalManual: 2, passedManual: 1, failedManual: 1 });
    expect(executionClient.getExecutionCycle).toHaveBeenCalledTimes(1);
  });

  test('re-registering a result on the same execution adjusts counters without changing the total', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });

    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'pass',
      }),
    );
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'fail',
      }),
    );

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report).toMatchObject({ totalManual: 1, passedManual: 0, failedManual: 1 });
  });

  test('maintains a FailedTest record while failing, and removes it once it passes', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });

    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        testCaseId: 'tc-1',
        status: 'fail',
        comments: 'Broken',
      }),
    );
    expect(await FailedTest.countDocuments({ origin: 'manual', sourceId: 'exec-1' })).toBe(1);

    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        testCaseId: 'tc-1',
        status: 'pass',
      }),
    );
    expect(await FailedTest.countDocuments({ origin: 'manual', sourceId: 'exec-1' })).toBe(0);
  });

  test('resolves testCaseId into a readable "code: title" name via qa-core-service', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    qaCoreClient.getTestCase.mockResolvedValue({ code: 'TC-006', title: 'Crear proyecto' });

    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        testCaseId: 'tc-1',
        status: 'fail',
      }),
    );

    const failedTest = await FailedTest.findOne({ origin: 'manual', sourceId: 'exec-1' });
    expect(qaCoreClient.getTestCase).toHaveBeenCalledWith('tc-1');
    expect(failedTest.testName).toBe('TC-006: Crear proyecto');
  });

  test('falls back to the raw testCaseId if qa-core-service lookup fails', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    qaCoreClient.getTestCase.mockRejectedValue(new Error('unreachable'));

    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        testCaseId: 'tc-1',
        status: 'fail',
      }),
    );

    const failedTest = await FailedTest.findOne({ origin: 'manual', sourceId: 'exec-1' });
    expect(failedTest.testName).toBe('tc-1');
  });

  test('idempotency: reprocessing the exact same event does not double count', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    const event = domainEvent('ExecutionUpdated', {
      executionId: 'exec-1',
      cycleId: 'cycle-1',
      status: 'pass',
    });

    const first = await processEvent(event);
    const second = await processEvent(event);

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report).toMatchObject({ totalManual: 1, passedManual: 1 });
  });

  test('is skipped gracefully when the cycle cannot be resolved', async () => {
    executionClient.getExecutionCycle.mockResolvedValue(null);

    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'ghost-cycle',
        status: 'pass',
      }),
    );

    expect(await CycleReport.countDocuments({})).toBe(0);
  });
});

describe('CycleFinished', () => {
  test('closes the cycle report and generates trend points per non-empty origin plus combined', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });

    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'pass',
      }),
    );
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-2',
        cycleId: 'cycle-1',
        status: 'fail',
      }),
    );

    await processEvent(domainEvent('CycleFinished', { cycleId: 'cycle-1', projectId: 'proj-1' }));

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report.status).toBe('closed');

    const points = await TrendPoint.find({ cycleId: 'cycle-1' }).sort({ origin: 1 });
    expect(points.map((p) => p.origin)).toEqual(['combined', 'manual']);
    const manualPoint = points.find((p) => p.origin === 'manual');
    expect(manualPoint.passRate).toBe(0.5);
  });

  test('idempotency: reprocessing CycleFinished does not duplicate trend points', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'pass',
      }),
    );

    const event = domainEvent('CycleFinished', { cycleId: 'cycle-1', projectId: 'proj-1' });
    await processEvent(event);
    await processEvent(event);

    const points = await TrendPoint.find({ cycleId: 'cycle-1' });
    expect(points).toHaveLength(2); // manual + combined, not doubled
  });
});

describe('AutomationRunIngested', () => {
  test('updates Allure counters and persists failing tests with rawReportUrl', async () => {
    executionClient.getAutomationRun.mockResolvedValue({
      _id: 'run-1',
      rawReportUrl: 'http://minio.local/bucket/allure.json',
    });
    executionClient.getAutomationRunTests.mockResolvedValue([
      { _id: 'atr-1', testName: 'Login test', suiteName: 'Login Suite', status: 'passed' },
      {
        _id: 'atr-2',
        testName: 'Logout test',
        suiteName: 'Login Suite',
        status: 'failed',
        errorMessage: 'boom',
      },
    ]);

    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-1',
        projectId: 'proj-1',
        cycleId: 'cycle-1',
        tool: 'allure',
        summary: { total: 2, passed: 1, failed: 1, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report).toMatchObject({ totalAllure: 2, passedAllure: 1, failedAllure: 1 });

    const failures = await FailedTest.find({ cycleId: 'cycle-1', origin: 'allure' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      testName: 'Logout test',
      rawReportUrl: 'http://minio.local/bucket/allure.json',
      errorMessage: 'boom',
    });
  });

  test('updates Newman counters separately from Allure', async () => {
    executionClient.getAutomationRun.mockResolvedValue({ _id: 'run-2', rawReportUrl: 'http://x' });
    executionClient.getAutomationRunTests.mockResolvedValue([]);

    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-2',
        projectId: 'proj-1',
        cycleId: 'cycle-1',
        tool: 'newman',
        summary: { total: 3, passed: 3, failed: 0, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report).toMatchObject({ totalNewman: 3, passedNewman: 3, totalAllure: 0 });
  });

  test('a run with no cycleId does not create a CycleReport', async () => {
    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-3',
        projectId: 'proj-1',
        cycleId: null,
        tool: 'allure',
        summary: { total: 1, passed: 1, failed: 0, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    expect(await CycleReport.countDocuments({})).toBe(0);
    expect(executionClient.getAutomationRun).not.toHaveBeenCalled();
  });

  // Etapa 5 (docs/postman-runner/etapa-5-sistema-de-reportes.md): a live
  // Postman Suite run has no cycleId — this is the sibling branch to the
  // cycleId-attributed tests above, attributing the same failures/trend
  // data to postmanSuiteId instead.
  test('a run with no cycleId but a postmanSuiteId still records failing tests and a trend point', async () => {
    executionClient.getAutomationRun.mockResolvedValue({
      _id: 'run-4',
      rawReportUrl: 'http://minio.local/bucket/newman-run.json',
    });
    executionClient.getAutomationRunTests.mockResolvedValue([
      { _id: 'atr-3', testName: 'GET /health', suiteName: 'Smoke API', status: 'passed' },
      {
        _id: 'atr-4',
        testName: 'POST /login',
        suiteName: 'Smoke API',
        status: 'failed',
        errorMessage: 'expected 200, got 500',
      },
    ]);

    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-4',
        projectId: 'proj-1',
        cycleId: null,
        postmanSuiteId: 'suite-1',
        tool: 'newman',
        summary: { total: 2, passed: 1, failed: 1, broken: 0, skipped: 0 },
        executedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    expect(await CycleReport.countDocuments({})).toBe(0);

    const failures = await FailedTest.find({ postmanSuiteId: 'suite-1', origin: 'newman' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      cycleId: null,
      testName: 'POST /login',
      rawReportUrl: 'http://minio.local/bucket/newman-run.json',
      errorMessage: 'expected 200, got 500',
    });

    const trendPoints = await TrendPoint.find({ postmanSuiteId: 'suite-1' });
    expect(trendPoints).toHaveLength(1);
    expect(trendPoints[0]).toMatchObject({
      projectId: 'proj-1',
      cycleId: null,
      origin: 'newman',
      passRate: 0.5,
    });
    expect(trendPoints[0].date.toISOString()).toBe('2026-01-01T00:00:00.000Z');

    // Same failures drill-down data reachable through the project trend
    // endpoint's data source — no cycleId filter, so a postmanSuiteId
    // point shows up in the project-wide trend just like any other origin.
    expect(executionClient.getAutomationRun).toHaveBeenCalledWith('run-4');
  });

  test('a run with neither cycleId nor postmanSuiteId does not create a FailedTest or TrendPoint', async () => {
    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-5',
        projectId: 'proj-1',
        cycleId: null,
        postmanSuiteId: null,
        tool: 'newman',
        summary: { total: 1, passed: 1, failed: 0, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    expect(await CycleReport.countDocuments({})).toBe(0);
    expect(await FailedTest.countDocuments({})).toBe(0);
    expect(await TrendPoint.countDocuments({})).toBe(0);
    expect(executionClient.getAutomationRun).not.toHaveBeenCalled();
  });
});

// Etapa 7 (docs/postman-runner/etapa-7-sistema-de-alertas.md).
describe('AutomationRunIngested → Notification', () => {
  test('creates a Notification when the run has at least one failed test, resolving the Suite name', async () => {
    executionClient.getPostmanSuite.mockResolvedValue({ _id: 'suite-1', name: 'Smoke API' });

    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-10',
        projectId: 'proj-1',
        cycleId: null,
        postmanSuiteId: 'suite-1',
        tool: 'newman',
        summary: { total: 2, passed: 1, failed: 1, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    const notifications = await Notification.find({ projectId: 'proj-1' });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      type: 'automation_run_failed',
      relatedAutomationRunId: 'run-10',
      isRead: false,
    });
    expect(notifications[0].message).toContain('Smoke API');
    expect(notifications[0].message).toContain('1 failed');
  });

  test('falls back to the raw id when the Suite/Cycle name cannot be resolved', async () => {
    executionClient.getPostmanSuite.mockResolvedValue(null);

    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-11',
        projectId: 'proj-1',
        cycleId: null,
        postmanSuiteId: 'suite-missing',
        tool: 'newman',
        summary: { total: 1, passed: 0, failed: 1, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    const [notification] = await Notification.find({ projectId: 'proj-1' });
    expect(notification.message).toContain('suite-missing');
  });

  test('does not create a Notification when nothing failed', async () => {
    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-12',
        projectId: 'proj-1',
        cycleId: null,
        postmanSuiteId: 'suite-1',
        tool: 'newman',
        summary: { total: 1, passed: 1, failed: 0, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    expect(await Notification.countDocuments({})).toBe(0);
  });

  test('still notifies for a cycle-attributed run with failures (Allure/manual Newman)', async () => {
    executionClient.getAutomationRun.mockResolvedValue({ _id: 'run-13', rawReportUrl: 'http://x' });
    executionClient.getAutomationRunTests.mockResolvedValue([]);
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-9', name: 'Regression' });

    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-13',
        projectId: 'proj-1',
        cycleId: 'cycle-9',
        tool: 'allure',
        summary: { total: 2, passed: 1, failed: 1, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    const [notification] = await Notification.find({ projectId: 'proj-1' });
    expect(notification).toBeDefined();
    expect(notification.message).toContain('Regression');
  });
});

describe('DefectCreated / DefectStatusChanged', () => {
  test('links a defect to a cycle via linkedExecutionId (resolved from the local execution index)', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'fail',
      }),
    );

    await processEvent(
      domainEvent('DefectCreated', {
        defectId: 'defect-1',
        projectId: 'proj-1',
        code: 'DEF-001',
        severity: 'high',
        linkedExecutionId: 'exec-1',
        linkedAutomationTestResultId: null,
      }),
    );

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report.linkedDefects).toHaveLength(1);
    expect(report.linkedDefects[0]).toMatchObject({
      defectId: 'defect-1',
      code: 'DEF-001',
      status: 'open',
    });
    expect(report.openDefectsLinked).toBe(1);

    const failedTest = await FailedTest.findOne({ origin: 'manual', sourceId: 'exec-1' });
    expect(failedTest.linkedDefect).toMatchObject({ defectId: 'defect-1', code: 'DEF-001' });
  });

  test('links a defect to a cycle via linkedAutomationTestResultId (one live lookup, then local index)', async () => {
    executionClient.getAutomationRun.mockResolvedValue({ _id: 'run-1', rawReportUrl: 'http://x' });
    executionClient.getAutomationRunTests.mockResolvedValue([]);
    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-1',
        projectId: 'proj-1',
        cycleId: 'cycle-1',
        tool: 'newman',
        summary: { total: 1, passed: 0, failed: 1, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    executionClient.getAutomationTestResult.mockResolvedValue({
      _id: 'atr-1',
      automationRunId: 'run-1',
    });

    await processEvent(
      domainEvent('DefectCreated', {
        defectId: 'defect-2',
        projectId: 'proj-1',
        code: 'DEF-002',
        severity: 'critical',
        linkedExecutionId: null,
        linkedAutomationTestResultId: 'atr-1',
      }),
    );

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report.linkedDefects).toHaveLength(1);
    expect(report.linkedDefects[0].code).toBe('DEF-002');
  });

  test('is skipped when the defect has no resolvable link', async () => {
    await processEvent(
      domainEvent('DefectCreated', {
        defectId: 'defect-3',
        projectId: 'proj-1',
        code: 'DEF-003',
        severity: 'low',
        linkedExecutionId: null,
        linkedAutomationTestResultId: null,
      }),
    );

    expect(await CycleReport.countDocuments({})).toBe(0);
  });

  test('DefectStatusChanged updates the embedded status and recomputes openDefectsLinked', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'fail',
      }),
    );
    await processEvent(
      domainEvent('DefectCreated', {
        defectId: 'defect-1',
        projectId: 'proj-1',
        code: 'DEF-001',
        severity: 'high',
        linkedExecutionId: 'exec-1',
      }),
    );

    await processEvent(
      domainEvent('DefectStatusChanged', {
        defectId: 'defect-1',
        projectId: 'proj-1',
        fromStatus: 'open',
        toStatus: 'closed',
      }),
    );

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report.linkedDefects[0].status).toBe('closed');
    expect(report.openDefectsLinked).toBe(0);

    const failedTest = await FailedTest.findOne({ origin: 'manual', sourceId: 'exec-1' });
    expect(failedTest.linkedDefect.status).toBe('closed');
  });
});

describe('unknown event types', () => {
  test('are skipped without throwing', async () => {
    const result = await processEvent(domainEvent('SomethingElse', { foo: 'bar' }));
    expect(result).toEqual({ skipped: true, reason: 'unknown-type' });
  });
});

describe('ExecutionIndex bookkeeping', () => {
  test('keeps the latest status for each execution', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'pass',
      }),
    );
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'fail',
      }),
    );

    const index = await ExecutionIndex.findById('exec-1');
    expect(index.status).toBe('fail');
  });
});
