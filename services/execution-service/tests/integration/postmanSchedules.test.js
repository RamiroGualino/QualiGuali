jest.mock('../../src/clients/projectsClient');
jest.mock('../../src/clients/s3Client');
jest.mock('../../src/services/events');
jest.mock('../../src/services/postmanRunner.service');

const path = require('path');
const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const projectsClient = require('../../src/clients/projectsClient');
const s3Client = require('../../src/clients/s3Client');
const events = require('../../src/services/events');
const postmanRunner = require('../../src/services/postmanRunner.service');
const PostmanSchedule = require('../../src/models/PostmanSchedule');
const AutomationRun = require('../../src/models/AutomationRun');
const {
  bootstrapSchedules,
  unregisterSchedule,
  registeredTasks,
} = require('../../src/services/postmanScheduler.service');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });
const fixture = (name) => path.join(__dirname, '../__fixtures__/postman', name);

function mockUpload() {
  let counter = 0;
  s3Client.uploadObject.mockImplementation(async () => {
    counter += 1;
    return `http://minio.local/qualiguali-evidence/postman-suites/file-${counter}.json`;
  });
}

// Every PostmanSuite must be related to a Requirement — format-validated
// only, so any well-formed ObjectId string works here.
const DEFAULT_REQUIREMENT_ID = '64b6f7e2f1a2b3c4d5e6f7a1';

async function createSuite(overrides = {}) {
  projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
  mockUpload();

  const res = await request(app)
    .post('/postman-suites')
    .set('Authorization', `Bearer ${qaToken()}`)
    .field('projectId', overrides.projectId || 'proj-1')
    .field('name', overrides.name || 'Smoke API')
    .field('requirementId', overrides.requirementId || DEFAULT_REQUIREMENT_ID)
    .attach('collection', fixture('valid-collection.json'));
  return res;
}

beforeAll(async () => testDb.connect());
afterEach(async () => {
  // Every registered task is a real node-cron timer — leaving one behind
  // (e.g. a schedule created but never deleted by a test) could fire during
  // a *later* test's fake-timer advance, or after fake timers are torn
  // down. Clearing the whole registry between tests keeps each test's
  // scheduler state isolated, the same way clearDatabase() isolates Mongo.
  [...registeredTasks.keys()].forEach(unregisterSchedule);
  // task.stop() only prevents *future* ticks — a tick that had already
  // fired a fraction of a second earlier (these tests use a real
  // seconds-resolution cron, see the describe block below) can still be
  // mid-flight in its own async callback right up to this point. Since
  // execution-service runs its whole suite with `jest --runInBand` (one
  // shared process for every test file, not one per file), a callback that
  // outlives this file — still awaiting a Mongo call against the exact
  // connection the *next* file's tests are using — can land its write (or
  // its mocked module's now-stale return value) in the middle of an
  // unrelated test. A short real wait here gives any such callback time to
  // actually finish before the database gets torn down or the next file's
  // tests start (reproduced: a full-suite run occasionally showed a
  // leftover "already running"/"scheduled" tick's log line — that exact
  // mock value belongs to one specific test below — bleeding into
  // automationRuns.test.js's retry tests).
  await new Promise((resolve) => setTimeout(resolve, 100));
  await testDb.clearDatabase();
  jest.resetAllMocks();
  jest.useRealTimers();
});
afterAll(async () => testDb.closeDatabase());

describe('POST /postman-schedules', () => {
  test('creates a schedule for a suite and registers it', async () => {
    const suiteRes = await createSuite();

    const res = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteRes.body.postmanSuite._id, cronExpression: '0 9 * * *' });

    expect(res.status).toBe(201);
    expect(res.body.postmanSchedule).toMatchObject({
      suiteId: suiteRes.body.postmanSuite._id,
      projectId: 'proj-1',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      isActive: true,
    });
    expect(registeredTasks.has(res.body.postmanSchedule._id)).toBe(true);
  });

  test('rejects an invalid cron expression', async () => {
    const suiteRes = await createSuite();

    const res = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteRes.body.postmanSuite._id, cronExpression: 'not a cron expression' });

    expect(res.status).toBe(400);
    expect(await PostmanSchedule.countDocuments({})).toBe(0);
  });

  test('rejects a missing/invalid suiteId', async () => {
    const res = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: '64b6f7e2f1a2b3c4d5e6f7a8', cronExpression: '0 9 * * *' });

    expect(res.status).toBe(400);
  });

  test('does not register a task when created inactive', async () => {
    const suiteRes = await createSuite();

    const res = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        suiteId: suiteRes.body.postmanSuite._id,
        cronExpression: '0 9 * * *',
        isActive: false,
      });

    expect(res.status).toBe(201);
    expect(registeredTasks.has(res.body.postmanSchedule._id)).toBe(false);
  });
});

describe('GET /postman-schedules', () => {
  test('filters by suiteId and projectId', async () => {
    const suiteA = await createSuite({ projectId: 'proj-1', name: 'Suite A' });
    const suiteB = await createSuite({ projectId: 'proj-2', name: 'Suite B' });
    await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteA.body.postmanSuite._id, cronExpression: '0 9 * * *' });
    await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteB.body.postmanSuite._id, cronExpression: '0 10 * * *' });

    const bySuite = await request(app)
      .get(`/postman-schedules?suiteId=${suiteA.body.postmanSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(bySuite.body.postmanSchedules).toHaveLength(1);

    const byProject = await request(app)
      .get('/postman-schedules?projectId=proj-2')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(byProject.body.postmanSchedules).toHaveLength(1);
    expect(byProject.body.postmanSchedules[0].projectId).toBe('proj-2');
  });
});

describe('PATCH /postman-schedules/:id', () => {
  test('updates the cron expression and re-registers the task', async () => {
    const suiteRes = await createSuite();
    const created = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteRes.body.postmanSuite._id, cronExpression: '0 9 * * *' });

    const res = await request(app)
      .patch(`/postman-schedules/${created.body.postmanSchedule._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ cronExpression: '0 10 * * *' });

    expect(res.status).toBe(200);
    expect(res.body.postmanSchedule.cronExpression).toBe('0 10 * * *');
    expect(registeredTasks.get(created.body.postmanSchedule._id).getPattern()).toBe('0 10 * * *');
  });

  test('deactivating unregisters the task without deleting the schedule', async () => {
    const suiteRes = await createSuite();
    const created = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteRes.body.postmanSuite._id, cronExpression: '0 9 * * *' });

    const res = await request(app)
      .patch(`/postman-schedules/${created.body.postmanSchedule._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(registeredTasks.has(created.body.postmanSchedule._id)).toBe(false);
    expect(await PostmanSchedule.findById(created.body.postmanSchedule._id)).not.toBeNull();
  });

  test('rejects an invalid cron expression on update', async () => {
    const suiteRes = await createSuite();
    const created = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteRes.body.postmanSuite._id, cronExpression: '0 9 * * *' });

    const res = await request(app)
      .patch(`/postman-schedules/${created.body.postmanSchedule._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ cronExpression: 'nope' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /postman-schedules/:id', () => {
  test('deletes the schedule and unregisters its task', async () => {
    const suiteRes = await createSuite();
    const created = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteRes.body.postmanSuite._id, cronExpression: '0 9 * * *' });

    const res = await request(app)
      .delete(`/postman-schedules/${created.body.postmanSchedule._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(204);
    expect(registeredTasks.has(created.body.postmanSchedule._id)).toBe(false);
    expect(await PostmanSchedule.findById(created.body.postmanSchedule._id)).toBeNull();
  });

  test('returns 404 for a non-existent schedule', async () => {
    const res = await request(app)
      .delete('/postman-schedules/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

// Etapa 6's own test plan calls for Jest fake timers here ("con Jest fake
// timers... verificar que al avanzar el reloj simulado el scheduler
// dispara la ejecución"). Verified empirically that this doesn't work in
// this codebase: node-cron's callback runs a real Mongoose query against
// mongodb-memory-server, and the Mongo driver's own internal socket/timeout
// handling depends on *real* timers — once Jest fakes global timers, a
// query issued from inside a fake-timer-triggered callback never resolves
// (reproduced in isolation: a bare `cron.schedule` + `PostmanSchedule.
// countDocuments()` under `jest.useFakeTimers()` hangs indefinitely, no
// exception, no timeout). Real timers + a seconds-resolution cron
// expression (node-cron supports an optional 6th "seconds" field) sidesteps
// this entirely: the wait is genuinely short (~1s) and every DB call inside
// the callback behaves exactly as it would outside a test.
describe('scheduled firing (real timers, seconds-resolution cron)', () => {
  const sampleSummary = {
    total: 1,
    passed: 1,
    failed: 0,
    broken: 0,
    skipped: 0,
    durationMs: 12,
    executedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const sampleTestResults = [
    { suiteName: 'Smoke API', testName: 'GET /health', status: 'passed', durationMs: 12 },
  ];

  async function waitFor(predicate, { timeoutMs = 3000, intervalMs = 50 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('waitFor: condition was not met within the timeout');
  }

  test('fires runSuite at the expected time and persists a scheduled AutomationRun', async () => {
    const suiteRes = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(false);
    postmanRunner.runSuite.mockResolvedValue({
      status: 'completed',
      summary: sampleSummary,
      testResults: sampleTestResults,
    });

    const created = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteRes.body.postmanSuite._id, cronExpression: '*/1 * * * * *' });
    expect(created.status).toBe(201);

    await waitFor(() => postmanRunner.runSuite.mock.calls.length > 0);
    await waitFor(async () => (await AutomationRun.countDocuments({})) > 0);

    expect(postmanRunner.runSuite).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.anything() }),
      expect.objectContaining({ triggerType: 'scheduled' }),
    );

    const runs = await AutomationRun.find({ projectId: 'proj-1' });
    expect(runs).toHaveLength(1);
    expect(runs[0].triggerType).toBe('scheduled');
    expect(events.publish).toHaveBeenCalledWith(
      'AutomationRunIngested',
      expect.objectContaining({ postmanSuiteId: suiteRes.body.postmanSuite._id }),
    );

    await waitFor(async () => {
      const schedule = await PostmanSchedule.findById(created.body.postmanSchedule._id);
      return schedule.lastRunAt !== null;
    });
    const schedule = await PostmanSchedule.findById(created.body.postmanSchedule._id);
    expect(schedule.lastRunStatus).toBe('completed');
  }, 10000);

  test('an inactive schedule never fires', async () => {
    const suiteRes = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(false);
    postmanRunner.runSuite.mockResolvedValue({
      status: 'completed',
      summary: sampleSummary,
      testResults: sampleTestResults,
    });

    await request(app).post('/postman-schedules').set('Authorization', `Bearer ${qaToken()}`).send({
      suiteId: suiteRes.body.postmanSuite._id,
      cronExpression: '*/1 * * * * *',
      isActive: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(postmanRunner.runSuite).not.toHaveBeenCalled();
    expect(await AutomationRun.countDocuments({})).toBe(0);
  }, 10000);

  test('a tick that lands while the Suite is already running is rejected by the concurrency guard, not silently lost', async () => {
    const suiteRes = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(false);
    postmanRunner.runSuite.mockResolvedValue({
      status: 'rejected',
      reason: 'already_running',
      message: 'already running',
      startedAt: new Date(),
      durationMs: 0,
    });

    const created = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteRes.body.postmanSuite._id, cronExpression: '*/1 * * * * *' });

    await waitFor(() => postmanRunner.runSuite.mock.calls.length > 0);
    await waitFor(async () => {
      const schedule = await PostmanSchedule.findById(created.body.postmanSchedule._id);
      return schedule.lastRunAt !== null;
    });

    // The scheduler still called runSuite() (the tick wasn't skipped or
    // dropped) — runSuite() itself is what decided to reject it, and that
    // decision is logged/recorded rather than disappearing silently.
    expect(await AutomationRun.countDocuments({})).toBe(0);
    const schedule = await PostmanSchedule.findById(created.body.postmanSchedule._id);
    expect(schedule.lastRunStatus).toBe('already_running');
  }, 10000);

  test('a run that fails is still recorded on the schedule, without creating an AutomationRun', async () => {
    const suiteRes = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(false);
    postmanRunner.runSuite.mockResolvedValue({
      status: 'failed',
      reason: 'timeout',
      message: 'Postman suite execution timed out after 30000ms',
      startedAt: new Date(),
      durationMs: 30000,
    });

    const created = await request(app)
      .post('/postman-schedules')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ suiteId: suiteRes.body.postmanSuite._id, cronExpression: '*/1 * * * * *' });

    await waitFor(async () => {
      const schedule = await PostmanSchedule.findById(created.body.postmanSchedule._id);
      return schedule.lastRunAt !== null;
    });

    expect(await AutomationRun.countDocuments({})).toBe(0);
    const schedule = await PostmanSchedule.findById(created.body.postmanSchedule._id);
    expect(schedule.lastRunStatus).toBe('timeout');
  }, 10000);
});

describe('bootstrapSchedules', () => {
  test('re-registers every active schedule already in the database at startup', async () => {
    const suiteRes = await createSuite();
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const schedule = await PostmanSchedule.create({
      suiteId: suiteRes.body.postmanSuite._id,
      projectId: 'proj-1',
      cronExpression: '* * * * *',
      timezone: 'UTC',
      isActive: true,
      createdBy: 'user-1',
    });
    const inactiveSchedule = await PostmanSchedule.create({
      suiteId: suiteRes.body.postmanSuite._id,
      projectId: 'proj-1',
      cronExpression: '* * * * *',
      timezone: 'UTC',
      isActive: false,
      createdBy: 'user-1',
    });

    await bootstrapSchedules();

    expect(registeredTasks.has(String(schedule._id))).toBe(true);
    expect(registeredTasks.has(String(inactiveSchedule._id))).toBe(false);
  });
});
