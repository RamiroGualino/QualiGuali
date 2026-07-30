jest.mock('../../src/clients/executionClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor, domainEvent } = require('../helpers/token');
const executionClient = require('../../src/clients/executionClient');
const { ROLES } = require('@qualiguali/shared');
const CycleReport = require('../../src/models/CycleReport');

const app = createApp();

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('POST /internal/events', () => {
  test('processes a domain event exactly like the SQS consumer would', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });

    const event = domainEvent('ExecutionUpdated', {
      executionId: 'exec-1',
      cycleId: 'cycle-1',
      testCaseId: 'tc-1',
      status: 'pass',
    });

    const res = await request(app)
      .post('/internal/events')
      .set('Authorization', `Bearer ${tokenFor({ role: ROLES.SUPER_ADMIN })}`)
      .send(event);

    expect(res.status).toBe(200);
    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report).toMatchObject({ projectId: 'proj-1', totalManual: 1, passedManual: 1 });
  });

  test('is idempotent — replaying the same eventId does not double-count', async () => {
    executionClient.getExecutionCycle.mockResolvedValue({ _id: 'cycle-1', projectId: 'proj-1' });
    const event = domainEvent('ExecutionUpdated', {
      executionId: 'exec-1',
      cycleId: 'cycle-1',
      testCaseId: 'tc-1',
      status: 'pass',
    });

    const send = () =>
      request(app)
        .post('/internal/events')
        .set('Authorization', `Bearer ${tokenFor({ role: ROLES.SUPER_ADMIN })}`)
        .send(event);

    await send();
    await send();

    const report = await CycleReport.findOne({ cycleId: 'cycle-1' });
    expect(report.totalManual).toBe(1);
  });

  test('rejects a caller without super_admin', async () => {
    const res = await request(app)
      .post('/internal/events')
      .set('Authorization', `Bearer ${tokenFor({ role: ROLES.QA_ENGINEER })}`)
      .send(domainEvent('ExecutionUpdated', { cycleId: 'cycle-1' }));

    expect(res.status).toBe(403);
  });

  test('rejects requests without a token', async () => {
    const res = await request(app)
      .post('/internal/events')
      .send(domainEvent('ExecutionUpdated', { cycleId: 'cycle-1' }));

    expect(res.status).toBe(401);
  });

  test('rejects a malformed event envelope', async () => {
    const res = await request(app)
      .post('/internal/events')
      .set('Authorization', `Bearer ${tokenFor({ role: ROLES.SUPER_ADMIN })}`)
      .send({ notAnEvent: true });

    expect(res.status).toBe(400);
  });
});
