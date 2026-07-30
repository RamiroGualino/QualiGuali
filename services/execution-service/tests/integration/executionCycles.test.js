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

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('POST /execution-cycles', () => {
  test('creates a cycle with no test plan and no precreated executions', async () => {
    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', name: 'Sprint 1 cycle' });

    expect(res.status).toBe(201);
    expect(res.body.executionCycle.status).toBe('planned');

    const executions = await request(app)
      .get(`/execution-cycles/${res.body.executionCycle._id}/executions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(executions.body.executions).toEqual([]);
  });

  test('bootstraps not_executed executions from a test plan', async () => {
    qaCoreClient.getTestPlan.mockResolvedValue({ _id: 'plan-1', testCaseIds: ['tc-1', 'tc-2'] });
    qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });

    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', testPlanId: 'plan-1', name: 'From plan' });

    expect(res.status).toBe(201);

    const executions = await request(app)
      .get(`/execution-cycles/${res.body.executionCycle._id}/executions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(executions.body.executions).toHaveLength(2);
    expect(executions.body.executions.every((e) => e.status === 'not_executed')).toBe(true);
  });

  test('rejects and rolls back when the test plan does not exist', async () => {
    qaCoreClient.getTestPlan.mockResolvedValue(null);

    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', testPlanId: 'missing-plan', name: 'Orphan cycle' });

    expect(res.status).toBe(400);

    const list = await request(app)
      .get('/execution-cycles?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(list.body.executionCycles).toHaveLength(0);
  });

  test('rejects and rolls back when a testCaseId in the plan no longer exists', async () => {
    qaCoreClient.getTestPlan.mockResolvedValue({ _id: 'plan-1', testCaseIds: ['tc-1', 'tc-2'] });
    qaCoreClient.getTestCase.mockImplementation((id) =>
      Promise.resolve(id === 'tc-1' ? { _id: 'tc-1' } : null),
    );

    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', testPlanId: 'plan-1', name: 'Bad plan' });

    expect(res.status).toBe(400);

    const list = await request(app)
      .get('/execution-cycles?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(list.body.executionCycles).toHaveLength(0);
  });

  test('rejects a missing name with 400', async () => {
    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1' });
    expect(res.status).toBe(400);
  });

  test('bootstraps not_executed executions from requirementIds', async () => {
    qaCoreClient.resolveTestCaseIdsFromRequirements.mockResolvedValue(['tc-1', 'tc-2']);
    qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });

    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', requirementIds: ['req-1'], name: 'From requirements' });

    expect(res.status).toBe(201);
    expect(qaCoreClient.resolveTestCaseIdsFromRequirements).toHaveBeenCalledWith(
      ['req-1'],
      expect.any(String),
    );

    const executions = await request(app)
      .get(`/execution-cycles/${res.body.executionCycle._id}/executions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(executions.body.executions).toHaveLength(2);
  });

  test('merges and dedupes test cases when both a test plan and requirementIds are given', async () => {
    qaCoreClient.getTestPlan.mockResolvedValue({ _id: 'plan-1', testCaseIds: ['tc-1', 'tc-2'] });
    qaCoreClient.resolveTestCaseIdsFromRequirements.mockResolvedValue(['tc-2', 'tc-3']);
    qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });

    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        testPlanId: 'plan-1',
        requirementIds: ['req-1'],
        name: 'From both',
      });

    expect(res.status).toBe(201);

    const executions = await request(app)
      .get(`/execution-cycles/${res.body.executionCycle._id}/executions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(executions.body.executions).toHaveLength(3);
  });

  test('rejects and rolls back when a requirementId does not exist', async () => {
    qaCoreClient.resolveTestCaseIdsFromRequirements.mockRejectedValue(
      Object.assign(new Error('Requirement "missing-req" not found in qa-core-service'), {
        status: 400,
      }),
    );

    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', requirementIds: ['missing-req'], name: 'Orphan cycle' });

    expect(res.status).toBe(400);

    const list = await request(app)
      .get('/execution-cycles?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(list.body.executionCycles).toHaveLength(0);
  });

  test('stores suite/description/assignee/priority metadata', async () => {
    qaCoreClient.getTestPlan.mockResolvedValue({ _id: 'plan-1', testCaseIds: [] });

    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        testPlanId: 'plan-1',
        suiteId: 'suite-1',
        name: 'Sprint 1 - regression',
        description: 'Regression pass before release',
        assignee: 'QA Engineer',
        priority: 'high',
      });

    expect(res.status).toBe(201);
    expect(res.body.executionCycle).toMatchObject({
      suiteId: 'suite-1',
      description: 'Regression pass before release',
      assignee: 'QA Engineer',
      priority: 'high',
    });
  });

  test('bootstraps only the explicit testCaseIds, ignoring the test plan auto-resolution', async () => {
    qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });

    const res = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        testPlanId: 'plan-1',
        suiteId: 'suite-1',
        name: 'Curated from suite',
        testCaseIds: ['tc-1'],
      });

    expect(res.status).toBe(201);
    expect(qaCoreClient.getTestPlan).not.toHaveBeenCalled();

    const executions = await request(app)
      .get(`/execution-cycles/${res.body.executionCycle._id}/executions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(executions.body.executions).toHaveLength(1);
    expect(executions.body.executions[0].testCaseId).toBe('tc-1');
  });
});

describe('PATCH /execution-cycles/:id', () => {
  test('updates name and dates', async () => {
    const created = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', name: 'Original name' });

    const res = await request(app)
      .patch(`/execution-cycles/${created.body.executionCycle._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ name: 'Renamed', status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.executionCycle.name).toBe('Renamed');
    expect(res.body.executionCycle.status).toBe('in_progress');
  });

  test('rejects trying to close via generic PATCH', async () => {
    const created = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', name: 'To protect' });

    const res = await request(app)
      .patch(`/execution-cycles/${created.body.executionCycle._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(400);
  });

  test('updates description, assignee and priority', async () => {
    const created = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', name: 'To edit' });

    const res = await request(app)
      .patch(`/execution-cycles/${created.body.executionCycle._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ description: 'Updated', assignee: 'Admin User', priority: 'critical' });

    expect(res.status).toBe(200);
    expect(res.body.executionCycle).toMatchObject({
      description: 'Updated',
      assignee: 'Admin User',
      priority: 'critical',
    });
  });
});

describe('POST /execution-cycles/:id/duplicate', () => {
  test('clones metadata and re-bootstraps the same test cases as fresh not_executed', async () => {
    qaCoreClient.getTestPlan.mockResolvedValue({ _id: 'plan-1', testCaseIds: ['tc-1', 'tc-2'] });
    qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });

    const created = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        testPlanId: 'plan-1',
        suiteId: 'suite-1',
        name: 'Original cycle',
        assignee: 'QA Engineer',
        priority: 'high',
      });

    const originalExecutions = await request(app)
      .get(`/execution-cycles/${created.body.executionCycle._id}/executions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    await request(app)
      .patch(`/executions/${originalExecutions.body.executions[0]._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass' });

    const res = await request(app)
      .post(`/execution-cycles/${created.body.executionCycle._id}/duplicate`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(201);
    expect(res.body.executionCycle).toMatchObject({
      name: 'Original cycle (copy)',
      suiteId: 'suite-1',
      assignee: 'QA Engineer',
      priority: 'high',
      status: 'planned',
    });

    const duplicateExecutions = await request(app)
      .get(`/execution-cycles/${res.body.executionCycle._id}/executions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(duplicateExecutions.body.executions).toHaveLength(2);
    expect(duplicateExecutions.body.executions.every((e) => e.status === 'not_executed')).toBe(
      true,
    );
  });

  test('404s for a missing cycle', async () => {
    const res = await request(app)
      .post('/execution-cycles/64b64b64b64b64b64b64b64b/duplicate')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /execution-cycles/:id', () => {
  test('cascades deletion to its executions', async () => {
    qaCoreClient.getTestPlan.mockResolvedValue({ _id: 'plan-1', testCaseIds: ['tc-1'] });
    qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });

    const created = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', testPlanId: 'plan-1', name: 'To delete' });

    const res = await request(app)
      .delete(`/execution-cycles/${created.body.executionCycle._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(204);

    const executions = await request(app)
      .get(`/executions?cycleId=${created.body.executionCycle._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(executions.body.executions).toEqual([]);
  });
});

describe('POST /execution-cycles/:id/close', () => {
  async function createCycleWithOneExecution() {
    qaCoreClient.getTestPlan.mockResolvedValue({ _id: 'plan-1', testCaseIds: ['tc-1'] });
    qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });

    const created = await request(app)
      .post('/execution-cycles')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', testPlanId: 'plan-1', name: 'To close' });
    return created.body.executionCycle;
  }

  test('refuses to close with pending not_executed executions unless forced', async () => {
    const cycle = await createCycleWithOneExecution();

    const res = await request(app)
      .post(`/execution-cycles/${cycle._id}/close`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(events.publish).not.toHaveBeenCalled();
  });

  test('closes when forced and publishes CycleFinished', async () => {
    const cycle = await createCycleWithOneExecution();

    const res = await request(app)
      .post(`/execution-cycles/${cycle._id}/close`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ force: true });

    expect(res.status).toBe(200);
    expect(res.body.executionCycle.status).toBe('closed');
    expect(events.publish).toHaveBeenCalledWith(
      'CycleFinished',
      expect.objectContaining({ cycleId: cycle._id, forced: true }),
    );
  });

  test('rejects closing an already-closed cycle', async () => {
    const cycle = await createCycleWithOneExecution();
    await request(app)
      .post(`/execution-cycles/${cycle._id}/close`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ force: true });

    const res = await request(app)
      .post(`/execution-cycles/${cycle._id}/close`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ force: true });

    expect(res.status).toBe(400);
  });

  test('closes without force once every execution has a result', async () => {
    const cycle = await createCycleWithOneExecution();
    const executions = await request(app)
      .get(`/execution-cycles/${cycle._id}/executions`)
      .set('Authorization', `Bearer ${qaToken()}`);

    await request(app)
      .patch(`/executions/${executions.body.executions[0]._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass' });

    const res = await request(app)
      .post(`/execution-cycles/${cycle._id}/close`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({});

    expect(res.status).toBe(200);
  });
});
