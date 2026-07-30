jest.mock('../../src/clients/executionClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor, domainEvent } = require('../helpers/token');
const executionClient = require('../../src/clients/executionClient');
const { processEvent } = require('../../src/consumers/processEvent');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('GET /reports/cycles/:cycleId', () => {
  test('returns 401 without a token', async () => {
    const res = await request(app).get('/reports/cycles/cycle-1');
    expect(res.status).toBe(401);
  });

  test('returns 404 when no report exists yet for that cycle', async () => {
    const res = await request(app)
      .get('/reports/cycles/cycle-1')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });

  test('combines manual + Allure + Newman KPIs for a cycle', async () => {
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

    executionClient.getAutomationRun.mockResolvedValue({
      _id: 'run-1',
      rawReportUrl: 'http://x/allure.json',
    });
    executionClient.getAutomationRunTests.mockResolvedValue([
      { _id: 'atr-1', testName: 'a', suiteName: 's', status: 'passed' },
      { _id: 'atr-2', testName: 'b', suiteName: 's', status: 'failed', errorMessage: 'oops' },
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

    executionClient.getAutomationRunTests.mockResolvedValue([]);
    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-2',
        projectId: 'proj-1',
        cycleId: 'cycle-1',
        tool: 'newman',
        summary: { total: 5, passed: 4, failed: 1, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    const res = await request(app)
      .get('/reports/cycles/cycle-1')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.report).toMatchObject({
      cycleId: 'cycle-1',
      projectId: 'proj-1',
      totalManual: 2,
      passedManual: 1,
      failedManual: 1,
      totalAllure: 2,
      passedAllure: 1,
      failedAllure: 1,
      totalNewman: 5,
      passedNewman: 4,
      failedNewman: 1,
    });
  });
});

describe('GET /reports/projects/:projectId/trend', () => {
  test('returns the trend series, filterable by origin and date range', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'pass',
      }),
    );
    await processEvent(domainEvent('CycleFinished', { cycleId: 'cycle-1', projectId: 'proj-1' }));

    const all = await request(app)
      .get('/reports/projects/proj-1/trend')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(all.body.trend).toHaveLength(2); // manual + combined

    const manualOnly = await request(app)
      .get('/reports/projects/proj-1/trend?origin=manual')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(manualOnly.body.trend).toHaveLength(1);
    expect(manualOnly.body.trend[0].origin).toBe('manual');

    const futureOnly = await request(app)
      .get('/reports/projects/proj-1/trend?from=2099-01-01')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(futureOnly.body.trend).toHaveLength(0);
  });
});

describe('GET /reports/cycles/:cycleId/failures', () => {
  test('lists failures with rawReportUrl (automation) and evidence (manual)', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        testCaseId: 'tc-1',
        status: 'fail',
        comments: 'Broken on staging',
      }),
    );

    executionClient.getAutomationRun.mockResolvedValue({
      _id: 'run-1',
      rawReportUrl: 'http://x/allure.json',
    });
    executionClient.getAutomationRunTests.mockResolvedValue([
      {
        _id: 'atr-1',
        testName: 'Checkout',
        suiteName: 'Payments',
        status: 'failed',
        errorMessage: 'timeout',
      },
    ]);
    await processEvent(
      domainEvent('AutomationRunIngested', {
        automationRunId: 'run-1',
        projectId: 'proj-1',
        cycleId: 'cycle-1',
        tool: 'allure',
        summary: { total: 1, passed: 0, failed: 1, broken: 0, skipped: 0 },
        executedAt: new Date().toISOString(),
      }),
    );

    executionClient.getExecutionEvidence.mockResolvedValue([
      { fileUrl: 'http://minio.local/bucket/screenshot.png', fileType: 'image' },
    ]);

    const res = await request(app)
      .get('/reports/cycles/cycle-1/failures')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.failures).toHaveLength(2);

    const manual = res.body.failures.find((f) => f.origin === 'manual');
    expect(manual.evidence).toEqual([
      { fileUrl: 'http://minio.local/bucket/screenshot.png', fileType: 'image' },
    ]);

    const automation = res.body.failures.find((f) => f.origin === 'allure');
    expect(automation.rawReportUrl).toBe('http://x/allure.json');
  });

  test('filters by origin', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'fail',
      }),
    );

    const res = await request(app)
      .get('/reports/cycles/cycle-1/failures?origin=allure')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.body.failures).toEqual([]);
  });

  test('includes the linked defect when one exists', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    await processEvent(
      domainEvent('ExecutionUpdated', {
        executionId: 'exec-1',
        cycleId: 'cycle-1',
        status: 'fail',
      }),
    );
    executionClient.getExecutionEvidence.mockResolvedValue([]);

    await processEvent(
      domainEvent('DefectCreated', {
        defectId: 'defect-1',
        projectId: 'proj-1',
        code: 'DEF-001',
        severity: 'high',
        linkedExecutionId: 'exec-1',
      }),
    );

    const res = await request(app)
      .get('/reports/cycles/cycle-1/failures')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.body.failures[0].linkedDefect).toMatchObject({
      defectId: 'defect-1',
      code: 'DEF-001',
    });
  });
});
