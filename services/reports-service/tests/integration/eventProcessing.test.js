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
