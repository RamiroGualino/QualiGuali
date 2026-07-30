// End-to-end flow required by the Parte 6 acceptance criteria: simulate a
// sequence of events (manual + allure + newman + defect) delivered through a
// fake SQS queue, against mongodb-memory-server, and verify
// GET /reports/cycles/:cycleId returns the correctly combined KPIs.
jest.mock('../../src/clients/executionClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor, domainEvent } = require('../helpers/token');
const executionClient = require('../../src/clients/executionClient');
const { createSqsConsumer } = require('../../src/consumers/sqsConsumer');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const token = tokenFor({ role: ROLES.QA_ENGINEER });
const authHeader = `Bearer ${token}`;

function fakeMessage(event) {
  return {
    MessageId: event.eventId,
    ReceiptHandle: `receipt-${event.eventId}`,
    Body: JSON.stringify(event),
  };
}

// A one-shot fake queue: delivers the whole batch on the first poll, then
// reports empty forever after (matching how a real queue drains).
function fakeQueueWithBatch(events) {
  let delivered = false;
  return {
    send: jest.fn(async (command) => {
      if (command.constructor.name === 'DeleteMessageCommand') return {};
      if (delivered) return { Messages: [] };
      delivered = true;
      return { Messages: events.map(fakeMessage) };
    }),
  };
}

beforeAll(async () => testDb.connect());
afterAll(async () => testDb.closeDatabase());

test('full flow: manual + allure + newman + defect events via a fake SQS queue', async () => {
  executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-e2e', projectId: 'proj-e2e' });
  executionClient.getAutomationRun.mockResolvedValue({
    _id: 'run-allure',
    rawReportUrl: 'http://minio.local/bucket/allure.json',
  });
  executionClient.getAutomationRunTests.mockImplementation(async (runId) =>
    runId === 'run-allure'
      ? [
          {
            _id: 'atr-1',
            testName: 'Checkout',
            suiteName: 'Payments',
            status: 'failed',
            errorMessage: 'timeout',
          },
        ]
      : [],
  );
  executionClient.getExecutionEvidence.mockResolvedValue([
    { fileUrl: 'http://minio.local/bucket/proof.png', fileType: 'image' },
  ]);

  const events = [
    domainEvent('ExecutionUpdated', {
      executionId: 'exec-e2e-1',
      cycleId: 'cycle-e2e',
      testCaseId: 'tc-1',
      status: 'pass',
    }),
    domainEvent('ExecutionUpdated', {
      executionId: 'exec-e2e-2',
      cycleId: 'cycle-e2e',
      testCaseId: 'tc-2',
      status: 'fail',
      comments: 'Broken checkout',
    }),
    domainEvent('AutomationRunIngested', {
      automationRunId: 'run-allure',
      projectId: 'proj-e2e',
      cycleId: 'cycle-e2e',
      tool: 'allure',
      summary: { total: 2, passed: 1, failed: 1, broken: 0, skipped: 0 },
      executedAt: new Date().toISOString(),
    }),
    domainEvent('AutomationRunIngested', {
      automationRunId: 'run-newman',
      projectId: 'proj-e2e',
      cycleId: 'cycle-e2e',
      tool: 'newman',
      summary: { total: 3, passed: 3, failed: 0, broken: 0, skipped: 0 },
      executedAt: new Date().toISOString(),
    }),
    domainEvent('DefectCreated', {
      defectId: 'defect-e2e',
      projectId: 'proj-e2e',
      code: 'DEF-001',
      severity: 'critical',
      linkedExecutionId: 'exec-e2e-2',
      linkedAutomationTestResultId: null,
    }),
  ];

  const sqsClient = fakeQueueWithBatch(events);
  const consumer = createSqsConsumer({ sqsClient, queueUrl: 'http://queue' });
  const processedCount = await consumer.pollOnce();
  expect(processedCount).toBe(events.length);

  const cycleRes = await request(app)
    .get('/reports/cycles/cycle-e2e')
    .set('Authorization', authHeader);
  expect(cycleRes.status).toBe(200);
  expect(cycleRes.body.report).toMatchObject({
    projectId: 'proj-e2e',
    totalManual: 2,
    passedManual: 1,
    failedManual: 1,
    totalAllure: 2,
    passedAllure: 1,
    failedAllure: 1,
    totalNewman: 3,
    passedNewman: 3,
    failedNewman: 0,
    openDefectsLinked: 1,
  });

  const failuresRes = await request(app)
    .get('/reports/cycles/cycle-e2e/failures')
    .set('Authorization', authHeader);
  expect(failuresRes.status).toBe(200);
  expect(failuresRes.body.failures).toHaveLength(2);

  const manualFailure = failuresRes.body.failures.find((f) => f.origin === 'manual');
  expect(manualFailure.linkedDefect).toMatchObject({ defectId: 'defect-e2e', code: 'DEF-001' });
  expect(manualFailure.evidence).toEqual([
    { fileUrl: 'http://minio.local/bucket/proof.png', fileType: 'image' },
  ]);

  const allureFailure = failuresRes.body.failures.find((f) => f.origin === 'allure');
  expect(allureFailure.rawReportUrl).toBe('http://minio.local/bucket/allure.json');
});
