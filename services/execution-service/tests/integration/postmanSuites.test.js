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
const AutomationRun = require('../../src/models/AutomationRun');
const PostmanSuite = require('../../src/models/PostmanSuite');
const PostmanSuiteVersion = require('../../src/models/PostmanSuiteVersion');
const PostmanSchedule = require('../../src/models/PostmanSchedule');
const { persistAutomationRun } = require('../../src/services/automationRunPersistence.service');
const { ROLES } = require('@qualiguali/shared');

// A Postman Suite must always be related to a Requirement (see
// PostmanSuite.requirementId's own comment) — format-validated only, no
// cross-service existence check, so any well-formed ObjectId string works
// as a stand-in throughout this file unless a test cares about the actual
// value.
const DEFAULT_REQUIREMENT_ID = '64b6f7e2f1a2b3c4d5e6f7a1';

// Flushes a handful of pending microtasks/macrotasks — enough for the
// fire-and-forget .then() chain in postmanRunner.controller.js (now three
// chained awaits: denormalize PostmanSuite.lastRunStatus, upload the raw
// report, then persistAutomationRun) to settle before a test asserts on
// what it did, without hardcoding a brittle real-time sleep.
async function flushAsync(times = 10) {
  for (let i = 0; i < times; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

const fixture = (name) => path.join(__dirname, '../__fixtures__/postman', name);

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

function mockUpload() {
  let counter = 0;
  s3Client.uploadObject.mockImplementation(async () => {
    counter += 1;
    return `http://minio.local/qualiguali-evidence/postman-suites/file-${counter}.json`;
  });
}

async function createSuite(overrides = {}) {
  projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
  mockUpload();

  let req = request(app)
    .post('/postman-suites')
    .set('Authorization', `Bearer ${qaToken()}`)
    .field('projectId', overrides.projectId || 'proj-1')
    .field('name', overrides.name || 'Smoke API')
    .field('requirementId', overrides.requirementId || DEFAULT_REQUIREMENT_ID);
  if (overrides.description) req = req.field('description', overrides.description);
  if (overrides.timeoutMs) req = req.field('timeoutMs', String(overrides.timeoutMs));
  req = req.attach('collection', fixture('valid-collection.json'));
  if (overrides.withEnvironment !== false) {
    req = req.attach('environment', fixture('valid-environment.json'));
  }
  return req;
}

describe('POST /postman-suites', () => {
  test('creates a suite with a collection + environment and a first version', async () => {
    const res = await createSuite();

    expect(res.status).toBe(201);
    expect(res.body.postmanSuite.name).toBe('Smoke API');
    expect(res.body.postmanSuite.projectId).toBe('proj-1');
    expect(res.body.postmanSuite.collectionVersion).toBe(1);
    expect(res.body.postmanSuite.environmentVersion).toBe(1);
    expect(res.body.postmanSuite.isActive).toBe(true);
    expect(res.body.postmanSuite.timeoutMs).toBe(30000);
    expect(res.body.postmanSuite.requirementId).toBe(DEFAULT_REQUIREMENT_ID);
    expect(res.body.postmanSuite.createdBy).toEqual(expect.any(String));

    const versions = await request(app)
      .get(`/postman-suites/${res.body.postmanSuite._id}/versions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(versions.body.versions).toHaveLength(1);
    expect(versions.body.versions[0].version).toBe(1);
  });

  test('creates a suite without an environment (optional)', async () => {
    const res = await createSuite({ withEnvironment: false });

    expect(res.status).toBe(201);
    expect(res.body.postmanSuite.environmentFileUrl).toBeNull();
    expect(res.body.postmanSuite.environmentVersion).toBeNull();
  });

  test('accepts an explicit requirementId', async () => {
    const requirementId = '64b6f7e2f1a2b3c4d5e6f7a8';
    const res = await createSuite({ requirementId });

    expect(res.status).toBe(201);
    expect(res.body.postmanSuite.requirementId).toBe(requirementId);
  });

  test('accepts a custom timeoutMs', async () => {
    const res = await createSuite({ timeoutMs: 60000 });
    expect(res.body.postmanSuite.timeoutMs).toBe(60000);
  });

  test('rejects a missing projectId', async () => {
    const res = await request(app)
      .post('/postman-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('name', 'Smoke API')
      .attach('collection', fixture('valid-collection.json'));
    expect(res.status).toBe(400);
    expect(projectsClient.getProject).not.toHaveBeenCalled();
  });

  test('rejects a missing name', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const res = await request(app)
      .post('/postman-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .attach('collection', fixture('valid-collection.json'));
    expect(res.status).toBe(400);
  });

  test('rejects a missing collection file', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const res = await request(app)
      .post('/postman-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .field('name', 'Smoke API');
    expect(res.status).toBe(400);
  });

  test('rejects an invalid collection file with 400 and never touches S3', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const res = await request(app)
      .post('/postman-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .field('name', 'Smoke API')
      .attach('collection', fixture('invalid-collection.json'));
    expect(res.status).toBe(400);
    expect(s3Client.uploadObject).not.toHaveBeenCalled();
  });

  test('rejects an invalid environment file with 400', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const res = await request(app)
      .post('/postman-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .field('name', 'Smoke API')
      .attach('collection', fixture('valid-collection.json'))
      .attach('environment', fixture('invalid-environment.json'));
    expect(res.status).toBe(400);
    expect(s3Client.uploadObject).not.toHaveBeenCalled();
  });

  test('rejects an invalid requirementId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const res = await request(app)
      .post('/postman-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .field('name', 'Smoke API')
      .field('requirementId', 'not-an-id')
      .attach('collection', fixture('valid-collection.json'));
    expect(res.status).toBe(400);
  });

  test('rejects a missing requirementId — every Suite must be related to a Requirement', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const res = await request(app)
      .post('/postman-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .field('name', 'Smoke API')
      .attach('collection', fixture('valid-collection.json'));
    expect(res.status).toBe(400);
  });

  test('rejects when the project does not exist in projects-service', async () => {
    projectsClient.getProject.mockResolvedValue(null);
    const res = await request(app)
      .post('/postman-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'missing-project')
      .field('name', 'Smoke API')
      .attach('collection', fixture('valid-collection.json'));
    expect(res.status).toBe(400);
  });

  test('rejects requests without a token', async () => {
    const res = await request(app)
      .post('/postman-suites')
      .field('projectId', 'proj-1')
      .field('name', 'Smoke API')
      .attach('collection', fixture('valid-collection.json'));
    expect(res.status).toBe(401);
  });
});

describe('GET /postman-suites', () => {
  test('filters by projectId, requirementId and isActive', async () => {
    const requirementId = '64b6f7e2f1a2b3c4d5e6f7a8';
    await createSuite({ projectId: 'proj-1', name: 'A' });
    await createSuite({ projectId: 'proj-2', name: 'B' });
    await createSuite({ projectId: 'proj-1', name: 'C', requirementId });

    const byProject = await request(app)
      .get('/postman-suites?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(byProject.body.postmanSuites).toHaveLength(2);

    const byRequirement = await request(app)
      .get(`/postman-suites?requirementId=${requirementId}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(byRequirement.body.postmanSuites).toHaveLength(1);
    expect(byRequirement.body.postmanSuites[0].name).toBe('C');

    const active = await request(app)
      .get('/postman-suites?isActive=true')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(active.body.postmanSuites).toHaveLength(3);
  });

  // Etapa 9 (frontend "is this Suite running right now" indicator).
  test('reports isRunning computed live from the concurrency guard, not persisted', async () => {
    const created = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(true);

    const res = await request(app)
      .get(`/postman-suites?projectId=${created.body.postmanSuite.projectId}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.body.postmanSuites[0].isRunning).toBe(true);
  });
});

describe('GET /postman-suites/:id', () => {
  test('fetches a single suite', async () => {
    const created = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(false);
    const res = await request(app)
      .get(`/postman-suites/${created.body.postmanSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.postmanSuite._id).toBe(created.body.postmanSuite._id);
    expect(res.body.postmanSuite.isRunning).toBe(false);
  });

  test('returns 404 for a non-existent suite', async () => {
    const res = await request(app)
      .get('/postman-suites/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /postman-suites/:id', () => {
  test('updates metadata fields only', async () => {
    const created = await createSuite();
    const res = await request(app)
      .patch(`/postman-suites/${created.body.postmanSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ name: 'Renamed', description: 'Updated', timeoutMs: 45000, isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.postmanSuite.name).toBe('Renamed');
    expect(res.body.postmanSuite.description).toBe('Updated');
    expect(res.body.postmanSuite.timeoutMs).toBe(45000);
    expect(res.body.postmanSuite.isActive).toBe(false);
  });

  test('returns 404 for a non-existent suite', async () => {
    const res = await request(app)
      .patch('/postman-suites/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ name: 'Renamed' });
    expect(res.status).toBe(404);
  });
});

describe('POST /postman-suites/:id/versions', () => {
  test('bumps collectionVersion and keeps the old environmentVersion when no new environment is uploaded', async () => {
    const created = await createSuite();

    const res = await request(app)
      .post(`/postman-suites/${created.body.postmanSuite._id}/versions`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('collection', fixture('valid-collection.json'));

    expect(res.status).toBe(201);
    expect(res.body.postmanSuite.collectionVersion).toBe(2);
    expect(res.body.postmanSuite.environmentVersion).toBe(1);
    expect(res.body.version.version).toBe(2);
    expect(res.body.version.environmentFileUrl).toBeNull();

    const versions = await request(app)
      .get(`/postman-suites/${created.body.postmanSuite._id}/versions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(versions.body.versions).toHaveLength(2);
    expect(versions.body.versions[0].version).toBe(2); // newest first
  });

  test('bumps both versions together when a new environment is uploaded too', async () => {
    const created = await createSuite();

    const res = await request(app)
      .post(`/postman-suites/${created.body.postmanSuite._id}/versions`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('collection', fixture('valid-collection.json'))
      .attach('environment', fixture('valid-environment.json'));

    expect(res.status).toBe(201);
    expect(res.body.postmanSuite.collectionVersion).toBe(2);
    expect(res.body.postmanSuite.environmentVersion).toBe(2);
  });

  test('rejects a missing collection file', async () => {
    const created = await createSuite();
    const res = await request(app)
      .post(`/postman-suites/${created.body.postmanSuite._id}/versions`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(400);
  });

  test('returns 404 for a non-existent suite', async () => {
    const res = await request(app)
      .post('/postman-suites/64b6f7e2f1a2b3c4d5e6f7a8/versions')
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('collection', fixture('valid-collection.json'));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /postman-suites/:id', () => {
  test('removes the suite itself and cascades to its versions', async () => {
    const created = await createSuite();

    const res = await request(app)
      .delete(`/postman-suites/${created.body.postmanSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(204);

    const fetched = await request(app)
      .get(`/postman-suites/${created.body.postmanSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(fetched.status).toBe(404);

    const versions = await PostmanSuiteVersion.find({ suiteId: created.body.postmanSuite._id });
    expect(versions).toHaveLength(0);
  });

  test("cascades to the suite's schedules, but keeps its AutomationRuns as historical records", async () => {
    const created = await createSuite();
    const suiteId = created.body.postmanSuite._id;
    await PostmanSchedule.create({
      suiteId,
      projectId: created.body.postmanSuite.projectId,
      cronExpression: '0 * * * *',
      createdBy: 'user-1',
    });
    await AutomationRun.create({
      projectId: created.body.postmanSuite.projectId,
      tool: 'newman',
      triggeredBy: 'user-1',
      rawReportUrl: 'http://minio.local/bucket/run.json',
      postmanSuiteId: suiteId,
      triggerType: 'manual',
      totalTests: 1,
      passed: 1,
      failed: 0,
      broken: 0,
      skipped: 0,
      durationMs: 10,
      executedAt: new Date(),
    });

    const res = await request(app)
      .delete(`/postman-suites/${suiteId}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(204);

    expect(await PostmanSchedule.find({ suiteId })).toHaveLength(0);
    // The run stays, still pointing at the now-gone suiteId — the same
    // "Suite desconocida" fallback AutomationPage's own Suite-name lookup
    // already needs for a manually-uploaded report is what covers this.
    const runs = await AutomationRun.find({ postmanSuiteId: suiteId });
    expect(runs).toHaveLength(1);
  });

  test('returns 404 for a non-existent suite', async () => {
    const res = await request(app)
      .delete('/postman-suites/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /postman-suites/:id/run', () => {
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
    {
      suiteName: 'Smoke API',
      testName: 'GET /health',
      status: 'passed',
      durationMs: 12,
      errorMessage: null,
      stackTraceExcerpt: null,
    },
  ];

  test('responds 202 immediately and persists an AutomationRun once the run completes', async () => {
    const created = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(false);
    postmanRunner.runSuite.mockResolvedValue({
      status: 'completed',
      summary: sampleSummary,
      testResults: sampleTestResults,
    });
    s3Client.uploadObject.mockResolvedValue(
      'http://minio.local/qualiguali-evidence/newman-report.json',
    );

    const res = await request(app)
      .post(`/postman-suites/${created.body.postmanSuite._id}/run`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      status: 'running',
      postmanSuiteId: created.body.postmanSuite._id,
    });

    await flushAsync();

    expect(postmanRunner.runSuite).toHaveBeenCalledWith(
      expect.objectContaining({ _id: expect.anything() }),
      expect.objectContaining({ triggerType: 'manual' }),
    );

    const runs = await AutomationRun.find({ projectId: created.body.postmanSuite.projectId });
    expect(runs).toHaveLength(1);
    expect(runs[0].tool).toBe('newman');
    expect(runs[0].totalTests).toBe(1);
    expect(runs[0].passed).toBe(1);
    expect(events.publish).toHaveBeenCalledWith(
      'AutomationRunIngested',
      expect.objectContaining({
        tool: 'newman',
        cycleId: null,
        postmanSuiteId: created.body.postmanSuite._id,
      }),
    );

    // Denormalized onto the Suite itself so the Suites list's Actions
    // column can tell "this Suite's last run executed" without a second
    // query against AutomationRun.
    const suiteDoc = await PostmanSuite.findById(created.body.postmanSuite._id);
    expect(suiteDoc.lastRunStatus).toBe('completed');
    expect(suiteDoc.lastRunAt).not.toBeNull();
  });

  // The bug this guards: PostmanSuite.lastRunStatus must reflect whether the
  // Suite *executed*, not whether every individual assertion inside it
  // passed — a run that completed but has failing/broken tests is still a
  // 'completed' execution. Per-test pass/fail belongs to the AutomationRun's
  // own testResults, surfaced elsewhere (the report), not here.
  test('records lastRunStatus as "completed" even when the run\'s own tests failed', async () => {
    const created = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(false);
    postmanRunner.runSuite.mockResolvedValue({
      status: 'completed',
      summary: { ...sampleSummary, passed: 0, failed: 1 },
      testResults: [{ ...sampleTestResults[0], status: 'failed', errorMessage: 'expected 201 got 401' }],
    });
    s3Client.uploadObject.mockResolvedValue(
      'http://minio.local/qualiguali-evidence/newman-report.json',
    );

    const res = await request(app)
      .post(`/postman-suites/${created.body.postmanSuite._id}/run`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(202);
    await flushAsync();

    const runs = await AutomationRun.find({ projectId: created.body.postmanSuite.projectId });
    expect(runs[0].failed).toBe(1);

    const suiteDoc = await PostmanSuite.findById(created.body.postmanSuite._id);
    expect(suiteDoc.lastRunStatus).toBe('completed');
  });

  test('does not persist anything when the run fails', async () => {
    const created = await createSuite();
    // createSuite() itself already uploaded a collection + environment file
    // — clear that call history so the assertion below only reflects what
    // the /run endpoint did (or, here, correctly didn't do).
    s3Client.uploadObject.mockClear();
    postmanRunner.isSuiteRunning.mockReturnValue(false);
    postmanRunner.runSuite.mockResolvedValue({
      status: 'failed',
      reason: 'timeout',
      message: 'Postman suite execution timed out after 30000ms',
    });

    const res = await request(app)
      .post(`/postman-suites/${created.body.postmanSuite._id}/run`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(202);
    await flushAsync();

    expect(s3Client.uploadObject).not.toHaveBeenCalled();
    const runs = await AutomationRun.find({ projectId: created.body.postmanSuite.projectId });
    expect(runs).toHaveLength(0);

    // No AutomationRun exists to tell the Suites list this attempt failed —
    // lastRunStatus on the Suite itself is what makes that visible.
    const suiteDoc = await PostmanSuite.findById(created.body.postmanSuite._id);
    expect(suiteDoc.lastRunStatus).toBe('timeout');
  });

  test('rejects with 409 when the suite is already running', async () => {
    const created = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(true);

    const res = await request(app)
      .post(`/postman-suites/${created.body.postmanSuite._id}/run`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(409);
    expect(postmanRunner.runSuite).not.toHaveBeenCalled();
  });

  test('rejects with 400 when the suite is not active', async () => {
    const created = await createSuite();
    postmanRunner.isSuiteRunning.mockReturnValue(false);
    // isActive: false via PATCH (the "Desactivar" toggle) — not DELETE,
    // which now really removes the Suite rather than just deactivating it.
    await request(app)
      .patch(`/postman-suites/${created.body.postmanSuite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ isActive: false });

    const res = await request(app)
      .post(`/postman-suites/${created.body.postmanSuite._id}/run`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(400);
    expect(postmanRunner.runSuite).not.toHaveBeenCalled();
  });

  test('returns 404 for a non-existent suite', async () => {
    const res = await request(app)
      .post('/postman-suites/64b6f7e2f1a2b3c4d5e6f7a8/run')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });

  test('rejects requests without a token', async () => {
    const created = await createSuite();
    const res = await request(app).post(`/postman-suites/${created.body.postmanSuite._id}/run`);
    expect(res.status).toBe(401);
  });
});

// Etapa 8 (docs/postman-runner/etapa-8-historial-y-auditoria.md).
describe('GET /postman-suites/:id/compare', () => {
  async function seedRun(suiteId, { executedAt, testResults }) {
    return persistAutomationRun({
      projectId: 'proj-1',
      tool: 'newman',
      triggeredBy: 'scheduler',
      postmanSuiteId: suiteId,
      triggerType: 'scheduled',
      rawReportUrl: 'http://minio.local/bucket/run.json',
      summary: {
        total: testResults.length,
        passed: testResults.filter((t) => t.status === 'passed').length,
        failed: testResults.filter((t) => t.status === 'failed').length,
        broken: 0,
        skipped: 0,
        durationMs: 12,
        executedAt,
      },
      testResults,
    });
  }

  test('defaults to the two most recent runs and flags a regression', async () => {
    const created = await createSuite();
    const suiteId = created.body.postmanSuite._id;

    await seedRun(suiteId, {
      executedAt: new Date('2026-01-01T00:00:00.000Z'),
      testResults: [
        { suiteName: 'Smoke API', testName: 'GET /health', status: 'passed', durationMs: 10 },
      ],
    });
    const later = await seedRun(suiteId, {
      executedAt: new Date('2026-01-02T00:00:00.000Z'),
      testResults: [
        { suiteName: 'Smoke API', testName: 'GET /health', status: 'failed', durationMs: 15 },
      ],
    });

    const res = await request(app)
      .get(`/postman-suites/${suiteId}/compare`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.runB._id).toBe(later._id.toString());
    expect(res.body.diff).toHaveLength(1);
    expect(res.body.diff[0]).toMatchObject({
      testName: 'GET /health',
      statusA: 'passed',
      statusB: 'failed',
      regression: true,
    });
  });

  test('accepts explicit runA/runB ids', async () => {
    const created = await createSuite();
    const suiteId = created.body.postmanSuite._id;

    const runA = await seedRun(suiteId, {
      executedAt: new Date('2026-01-01T00:00:00.000Z'),
      testResults: [
        { suiteName: 'Smoke API', testName: 'GET /health', status: 'failed', durationMs: 10 },
      ],
    });
    const runB = await seedRun(suiteId, {
      executedAt: new Date('2026-01-02T00:00:00.000Z'),
      testResults: [
        { suiteName: 'Smoke API', testName: 'GET /health', status: 'passed', durationMs: 15 },
      ],
    });

    const res = await request(app)
      .get(`/postman-suites/${suiteId}/compare?runA=${runA._id}&runB=${runB._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.diff[0]).toMatchObject({ fixed: true, regression: false });
  });

  test('rejects with 400 when fewer than two runs exist and none were specified', async () => {
    const created = await createSuite();
    const suiteId = created.body.postmanSuite._id;
    await seedRun(suiteId, {
      executedAt: new Date(),
      testResults: [
        { suiteName: 'Smoke API', testName: 'GET /health', status: 'passed', durationMs: 10 },
      ],
    });

    const res = await request(app)
      .get(`/postman-suites/${suiteId}/compare`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(400);
  });

  test('rejects with 400 when a given run does not belong to this suite', async () => {
    const suiteOne = await createSuite();
    const suiteTwo = await createSuite();

    const runFromSuiteOne = await seedRun(suiteOne.body.postmanSuite._id, {
      executedAt: new Date('2026-01-01T00:00:00.000Z'),
      testResults: [
        { suiteName: 'Smoke API', testName: 'GET /health', status: 'passed', durationMs: 10 },
      ],
    });
    const runFromSuiteTwo = await seedRun(suiteTwo.body.postmanSuite._id, {
      executedAt: new Date('2026-01-02T00:00:00.000Z'),
      testResults: [
        { suiteName: 'Smoke API', testName: 'GET /health', status: 'failed', durationMs: 10 },
      ],
    });

    const res = await request(app)
      .get(
        `/postman-suites/${suiteOne.body.postmanSuite._id}/compare?runA=${runFromSuiteOne._id}&runB=${runFromSuiteTwo._id}`,
      )
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(400);
  });

  test('returns 404 for a non-existent suite', async () => {
    const res = await request(app)
      .get('/postman-suites/64b6f7e2f1a2b3c4d5e6f7a8/compare')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});
