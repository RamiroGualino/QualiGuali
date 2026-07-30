jest.mock('../../src/clients/qaCoreClient');
jest.mock('../../src/services/events');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const qaCoreClient = require('../../src/clients/qaCoreClient');
const events = require('../../src/services/events');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

async function createExecution() {
  qaCoreClient.getTestPlan.mockResolvedValue({ _id: 'plan-1', testCaseIds: ['tc-1'] });
  qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });

  const cycle = await request(app)
    .post('/execution-cycles')
    .set('Authorization', `Bearer ${qaToken()}`)
    .send({ projectId: 'proj-1', testPlanId: 'plan-1', name: 'Cycle' });

  const executions = await request(app)
    .get(`/execution-cycles/${cycle.body.executionCycle._id}/executions`)
    .set('Authorization', `Bearer ${qaToken()}`);
  return executions.body.executions[0];
}

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('PATCH /executions/:id', () => {
  test('registers a pass result and publishes ExecutionUpdated', async () => {
    const execution = await createExecution();

    const res = await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass', comments: 'Looks good' });

    expect(res.status).toBe(200);
    expect(res.body.execution.status).toBe('pass');
    expect(res.body.execution.comments).toBe('Looks good');
    expect(res.body.execution.executedAt).toEqual(expect.any(String));
    expect(events.publish).toHaveBeenCalledWith(
      'ExecutionUpdated',
      expect.objectContaining({ executionId: execution._id, status: 'pass' }),
    );
  });

  test('allows re-executing (pass -> fail)', async () => {
    const execution = await createExecution();

    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass' });

    const res = await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'fail', comments: 'Regressed' });

    expect(res.status).toBe(200);
    expect(res.body.execution.status).toBe('fail');
  });

  test('rejects an invalid status', async () => {
    const execution = await createExecution();

    const res = await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'bogus' });

    expect(res.status).toBe(400);
    expect(events.publish).not.toHaveBeenCalled();
  });

  test('returns 404 for a non-existent execution', async () => {
    const res = await request(app)
      .patch('/executions/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass' });

    expect(res.status).toBe(404);
  });

  test('rejects requests without a token', async () => {
    const execution = await createExecution();

    const res = await request(app).patch(`/executions/${execution._id}`).send({ status: 'pass' });

    expect(res.status).toBe(401);
  });
});

describe('GET /executions/:id/history', () => {
  test('records one entry per registered result, newest first', async () => {
    const execution = await createExecution();

    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'fail', comments: 'First attempt' });

    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass', comments: 'Fixed and re-tested' });

    const res = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(2);
    expect(res.body.history[0]).toMatchObject({ status: 'pass', comments: 'Fixed and re-tested' });
    expect(res.body.history[1]).toMatchObject({ status: 'fail', comments: 'First attempt' });
  });

  test('returns an empty history for a never-executed case', async () => {
    const execution = await createExecution();

    const res = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.history).toEqual([]);
  });

  test('returns 404 for a non-existent execution', async () => {
    const res = await request(app)
      .get('/executions/64b6f7e2f1a2b3c4d5e6f7a8/history')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /executions/:id/history/:historyId', () => {
  test('removes the entry', async () => {
    const execution = await createExecution();
    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'fail', comments: 'First attempt' });

    const history = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const res = await request(app)
      .delete(`/executions/${execution._id}/history/${history.body.history[0]._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(204);

    const historyAfter = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(historyAfter.body.history).toHaveLength(0);
  });

  test('re-derives the Execution doc from the next-newest entry when the latest is deleted', async () => {
    const execution = await createExecution();
    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'fail', comments: 'First attempt' });
    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass', comments: 'Fixed and re-tested' });

    const history = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(history.body.history[0].status).toBe('pass');

    await request(app)
      .delete(`/executions/${execution._id}/history/${history.body.history[0]._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const executionAfter = await request(app)
      .get(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(executionAfter.body.execution.status).toBe('fail');
    expect(executionAfter.body.execution.comments).toBe('First attempt');
  });

  test('resets the Execution doc to not_executed when the only entry is deleted', async () => {
    const execution = await createExecution();
    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass' });

    const history = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);

    await request(app)
      .delete(`/executions/${execution._id}/history/${history.body.history[0]._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const executionAfter = await request(app)
      .get(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(executionAfter.body.execution.status).toBe('not_executed');
    expect(executionAfter.body.execution.executedAt).toBeNull();
  });

  test('leaves the Execution doc untouched when a non-latest entry is deleted', async () => {
    const execution = await createExecution();
    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'fail', comments: 'First attempt' });
    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass', comments: 'Fixed and re-tested' });

    const history = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);
    const oldestEntryId = history.body.history[1]._id;

    await request(app)
      .delete(`/executions/${execution._id}/history/${oldestEntryId}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const executionAfter = await request(app)
      .get(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(executionAfter.body.execution.status).toBe('pass');
    expect(executionAfter.body.execution.comments).toBe('Fixed and re-tested');
  });

  test('returns 404 for a history entry that does not belong to this execution', async () => {
    const execution = await createExecution();

    const res = await request(app)
      .delete(`/executions/${execution._id}/history/64b6f7e2f1a2b3c4d5e6f7a8`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(404);
  });
});
