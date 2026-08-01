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
const { persistAutomationRun } = require('../../src/services/automationRunPersistence.service');
const PostmanSuite = require('../../src/models/PostmanSuite');
const PostmanSuiteVersion = require('../../src/models/PostmanSuiteVersion');
const AutomationRun = require('../../src/models/AutomationRun');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

const allureFixture = (name) => path.join(__dirname, '../__fixtures__/allure', name);
const newmanFixture = (name) => path.join(__dirname, '../__fixtures__/newman', name);

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('POST /execution/automation-runs', () => {
  test('ingests an Allure run (multiple result files) and publishes AutomationRunIngested', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    s3Client.uploadObject.mockResolvedValue(
      'http://minio.local/qualiguali-evidence/allure-bundle.json',
    );

    const res = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .attach('files', allureFixture('passed.json'))
      .attach('files', allureFixture('failed.json'))
      .attach('files', allureFixture('skipped.json'));

    expect(res.status).toBe(201);
    expect(res.body.automationRun.tool).toBe('allure');
    expect(res.body.automationRun.totalTests).toBe(3);
    expect(res.body.automationRun.passed).toBe(1);
    expect(res.body.automationRun.failed).toBe(1);
    expect(res.body.automationRun.skipped).toBe(1);
    expect(res.body.automationRun.rawReportUrl).toBe(
      'http://minio.local/qualiguali-evidence/allure-bundle.json',
    );
    expect(res.body.automationRun.triggeredBy).toEqual(expect.any(String));

    expect(s3Client.uploadObject).toHaveBeenCalledWith(
      expect.stringContaining('automation-runs/allure/'),
      expect.any(Buffer),
      'application/json',
    );

    expect(events.publish).toHaveBeenCalledWith(
      'AutomationRunIngested',
      expect.objectContaining({
        automationRunId: res.body.automationRun._id,
        projectId: 'proj-1',
        tool: 'allure',
        summary: { total: 3, passed: 1, failed: 1, broken: 0, skipped: 1 },
      }),
    );

    const testsRes = await request(app)
      .get(`/execution/automation-runs/${res.body.automationRun._id}/tests`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(testsRes.body.testResults).toHaveLength(3);
  });

  test('ingests a Newman run (single file) with auto-detected tool', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/newman.json');

    const res = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .attach('files', newmanFixture('with-failures.json'));

    expect(res.status).toBe(201);
    expect(res.body.automationRun.tool).toBe('newman');
    expect(res.body.automationRun.totalTests).toBe(2);
    expect(res.body.automationRun.passed).toBe(1);
    expect(res.body.automationRun.failed).toBe(1);
    expect(res.body.automationRun.broken).toBe(0);
  });

  test('honors an explicit tool field', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/newman.json');

    const res = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .field('tool', 'newman')
      .attach('files', newmanFixture('all-passed.json'));

    expect(res.status).toBe(201);
    expect(res.body.automationRun.tool).toBe('newman');
  });

  test('rejects when the explicit tool does not match the file shape', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .field('tool', 'newman')
      .attach('files', allureFixture('passed.json'));

    expect(res.status).toBe(400);
    expect(s3Client.uploadObject).not.toHaveBeenCalled();
  });

  test('rejects an unrecognized report format with a clear 400', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .attach('files', Buffer.from(JSON.stringify({ nothing: 'to see here' })), 'weird.json');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Unrecognized report format/);
  });

  test('rejects a missing projectId with 400', async () => {
    const res = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('files', newmanFixture('all-passed.json'));

    expect(res.status).toBe(400);
    expect(projectsClient.getProject).not.toHaveBeenCalled();
  });

  test('rejects a request with no files', async () => {
    const res = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1');

    expect(res.status).toBe(400);
  });

  test('rejects when the project does not exist in projects-service', async () => {
    projectsClient.getProject.mockResolvedValue(null);

    const res = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'missing-project')
      .attach('files', newmanFixture('all-passed.json'));

    expect(res.status).toBe(400);
  });

  test('rejects an unknown cycleId with 400', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .field('cycleId', '64b6f7e2f1a2b3c4d5e6f7a8')
      .attach('files', newmanFixture('all-passed.json'));

    expect(res.status).toBe(400);
  });

  test('rejects requests without a token', async () => {
    const res = await request(app)
      .post('/execution/automation-runs')
      .field('projectId', 'proj-1')
      .attach('files', newmanFixture('all-passed.json'));

    expect(res.status).toBe(401);
  });
});

describe('GET /execution/automation-runs', () => {
  async function ingest(projectId, tool, fixturePath) {
    projectsClient.getProject.mockResolvedValue({ _id: projectId });
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/x.json');

    return request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', projectId)
      .field('tool', tool)
      .attach('files', fixturePath);
  }

  test('filters by projectId and tool', async () => {
    await ingest('proj-1', 'newman', newmanFixture('all-passed.json'));
    await ingest('proj-2', 'newman', newmanFixture('all-passed.json'));

    const res = await request(app)
      .get('/execution/automation-runs?projectId=proj-1&tool=newman')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.automationRuns).toHaveLength(1);
    expect(res.body.automationRuns[0].projectId).toBe('proj-1');
  });

  test('filters by executedAt range (from/to)', async () => {
    await ingest('proj-1', 'newman', newmanFixture('all-passed.json')); // executedAt 2023-11-14T22:13:20.000Z

    const inRange = await request(app)
      .get('/execution/automation-runs?from=2023-01-01&to=2024-01-01')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(inRange.body.automationRuns).toHaveLength(1);

    const outOfRange = await request(app)
      .get('/execution/automation-runs?from=2025-01-01')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(outOfRange.body.automationRuns).toHaveLength(0);
  });

  // Etapa 8 (docs/postman-runner/etapa-8-historial-y-auditoria.md).
  test('filters by postmanSuiteId', async () => {
    const summary = {
      total: 1,
      passed: 1,
      failed: 0,
      broken: 0,
      skipped: 0,
      durationMs: 12,
      executedAt: new Date(),
    };
    const suiteRun = await persistAutomationRun({
      projectId: 'proj-1',
      tool: 'newman',
      triggeredBy: 'scheduler',
      postmanSuiteId: '64b6f7e2f1a2b3c4d5e6f7aa',
      triggerType: 'scheduled',
      rawReportUrl: 'http://minio.local/bucket/suite-run.json',
      summary,
      testResults: [],
    });
    await ingest('proj-1', 'newman', newmanFixture('all-passed.json'));

    const res = await request(app)
      .get(`/execution/automation-runs?postmanSuiteId=${suiteRun.postmanSuiteId}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.automationRuns).toHaveLength(1);
    expect(res.body.automationRuns[0]._id).toBe(suiteRun._id.toString());
  });

  test('rejects an invalid postmanSuiteId with 400', async () => {
    const res = await request(app)
      .get('/execution/automation-runs?postmanSuiteId=not-an-id')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /execution/automation-runs/:id', () => {
  test('fetches a single run by id, including rawReportUrl (used by reports-service)', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/newman.json');

    const created = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .attach('files', newmanFixture('all-passed.json'));

    const res = await request(app)
      .get(`/execution/automation-runs/${created.body.automationRun._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.automationRun._id).toBe(created.body.automationRun._id);
    expect(res.body.automationRun.rawReportUrl).toBe(
      'http://minio.local/qualiguali-evidence/newman.json',
    );
  });

  test('returns 404 for a non-existent run', async () => {
    const res = await request(app)
      .get('/execution/automation-runs/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /execution/automation-runs/:id/tests', () => {
  test('supports filtering by status for drill-down', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/x.json');

    const created = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .attach('files', allureFixture('passed.json'))
      .attach('files', allureFixture('failed.json'))
      .attach('files', allureFixture('skipped.json'));

    const res = await request(app)
      .get(`/execution/automation-runs/${created.body.automationRun._id}/tests?status=failed`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.testResults).toHaveLength(1);
    expect(res.body.testResults[0].status).toBe('failed');
  });

  test('returns 404 for a non-existent automation run', async () => {
    const res = await request(app)
      .get('/execution/automation-runs/64b6f7e2f1a2b3c4d5e6f7a8/tests')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('persistAutomationRun (Etapa 4: postmanSuiteId/triggerType and request/response detail)', () => {
  test('round-trips postmanSuiteId, triggerType, and per-test request/response/logs through GET endpoints', async () => {
    const postmanSuiteId = '64b6f7e2f1a2b3c4d5e6f7aa';
    const largeResponseBody = 'x'.repeat(21 * 1024); // over the 20KB inline threshold
    s3Client.uploadObject.mockResolvedValue(
      'http://minio.local/qualiguali-evidence/large-body.json',
    );

    const automationRun = await persistAutomationRun({
      projectId: 'proj-1',
      cycleId: null,
      tool: 'newman',
      triggeredBy: 'user-1',
      postmanSuiteId,
      triggerType: 'scheduled',
      rawReportUrl: 'http://minio.local/qualiguali-evidence/postman-run.json',
      summary: {
        total: 1,
        passed: 1,
        failed: 0,
        broken: 0,
        skipped: 0,
        durationMs: 42,
        executedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      testResults: [
        {
          suiteName: 'Sample',
          testName: 'GET /health',
          status: 'passed',
          durationMs: 12,
          method: 'GET',
          url: 'https://api.example.com/health',
          requestHeaders: [{ key: 'Accept', value: 'application/json' }],
          requestBody: null,
          responseStatus: 200,
          responseHeaders: [{ key: 'content-type', value: 'application/json' }],
          responseBody: largeResponseBody,
          logs: ['[info] starting request', '[info] done'],
        },
      ],
    });

    expect(s3Client.uploadObject).toHaveBeenCalledWith(
      expect.stringContaining(`automation-runs/${automationRun._id}/results/0-responseBody`),
      expect.any(Buffer),
      'application/json',
    );

    const runRes = await request(app)
      .get(`/execution/automation-runs/${automationRun._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(runRes.status).toBe(200);
    expect(runRes.body.automationRun.postmanSuiteId).toBe(postmanSuiteId);
    expect(runRes.body.automationRun.triggerType).toBe('scheduled');

    // Etapa 5: postmanSuiteId also needs to reach reports-service through
    // the event itself, not just be readable back via this GET.
    expect(events.publish).toHaveBeenCalledWith(
      'AutomationRunIngested',
      expect.objectContaining({ postmanSuiteId, cycleId: null }),
    );

    const testsRes = await request(app)
      .get(`/execution/automation-runs/${automationRun._id}/tests`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(testsRes.status).toBe(200);
    expect(testsRes.body.testResults).toHaveLength(1);

    const [testResult] = testsRes.body.testResults;
    expect(testResult.method).toBe('GET');
    expect(testResult.url).toBe('https://api.example.com/health');
    expect(testResult.responseStatus).toBe(200);
    expect(testResult.logs).toEqual(['[info] starting request', '[info] done']);
    // Small enough to stay inline in Mongo.
    expect(testResult.requestHeaders).toEqual({
      storage: 'inline',
      value: [{ key: 'Accept', value: 'application/json' }],
    });
    // null passes through untouched, not wrapped as { storage: 'inline', value: null }.
    expect(testResult.requestBody).toBeNull();
    // Over threshold — stored in S3, only the URL kept on the document.
    expect(testResult.responseBody).toEqual({
      storage: 's3',
      url: 'http://minio.local/qualiguali-evidence/large-body.json',
    });
  });

  test('defaults postmanSuiteId to null and triggerType to "manual" when omitted (manual-upload path)', async () => {
    const automationRun = await persistAutomationRun({
      projectId: 'proj-1',
      cycleId: null,
      tool: 'newman',
      triggeredBy: 'user-1',
      rawReportUrl: 'http://minio.local/qualiguali-evidence/newman.json',
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        broken: 0,
        skipped: 0,
        durationMs: 0,
        executedAt: new Date(),
      },
      testResults: [],
    });

    expect(automationRun.postmanSuiteId).toBeNull();
    expect(automationRun.triggerType).toBe('manual');
  });
});

describe('GET /execution/automation-test-results/:id', () => {
  test('fetches a single test result by its own id (used by defects-service to link)', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/x.json');

    const created = await request(app)
      .post('/execution/automation-runs')
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('projectId', 'proj-1')
      .attach('files', allureFixture('failed.json'));

    const runTests = await request(app)
      .get(`/execution/automation-runs/${created.body.automationRun._id}/tests`)
      .set('Authorization', `Bearer ${qaToken()}`);
    const testResultId = runTests.body.testResults[0]._id;

    const res = await request(app)
      .get(`/execution/automation-test-results/${testResultId}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.testResult._id).toBe(testResultId);
    expect(res.body.testResult.status).toBe('failed');
  });

  test('returns 404 for a non-existent test result', async () => {
    const res = await request(app)
      .get('/execution/automation-test-results/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

// Etapa 6 (docs/postman-runner/etapa-6-programacion-automatica.md).
describe('POST /execution/automation-runs/:id/retry', () => {
  async function flushAsync(times = 5) {
    for (let i = 0; i < times; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  // A Suite currently on v2, whose v1 files differ from its current ones —
  // exactly the setup that proves a retry uses the *original* run's
  // version, not whatever the Suite points to today.
  async function createSuiteAtVersion2() {
    const suite = await PostmanSuite.create({
      projectId: 'proj-1',
      requirementId: '64b6f7e2f1a2b3c4d5e6f7a1',
      name: 'Smoke API',
      collectionFileUrl: 'http://minio.local/bucket/collection-v2.json',
      collectionVersion: 2,
      environmentFileUrl: 'http://minio.local/bucket/environment-v2.json',
      environmentVersion: 2,
      createdBy: 'user-1',
    });
    await PostmanSuiteVersion.create({
      suiteId: suite._id,
      collectionFileUrl: 'http://minio.local/bucket/collection-v1.json',
      environmentFileUrl: 'http://minio.local/bucket/environment-v1.json',
      version: 1,
      createdBy: 'user-1',
    });
    await PostmanSuiteVersion.create({
      suiteId: suite._id,
      collectionFileUrl: 'http://minio.local/bucket/collection-v2.json',
      environmentFileUrl: 'http://minio.local/bucket/environment-v2.json',
      version: 2,
      createdBy: 'user-1',
    });
    return suite;
  }

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

  test("re-runs with the collection/environment version the original run used, not the Suite's current one", async () => {
    const suite = await createSuiteAtVersion2();
    const originalRun = await persistAutomationRun({
      projectId: 'proj-1',
      tool: 'newman',
      triggeredBy: 'scheduler',
      postmanSuiteId: suite._id,
      triggerType: 'scheduled',
      collectionVersion: 1,
      environmentVersion: 1,
      rawReportUrl: 'http://minio.local/bucket/original-run.json',
      summary: sampleSummary,
      testResults: sampleTestResults,
    });

    postmanRunner.isSuiteRunning.mockReturnValue(false);
    postmanRunner.runSuite.mockResolvedValue({
      status: 'completed',
      summary: sampleSummary,
      testResults: sampleTestResults,
    });
    s3Client.uploadObject.mockResolvedValue('http://minio.local/bucket/retry-run.json');

    const res = await request(app)
      .post(`/execution/automation-runs/${originalRun._id}/retry`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: 'running', postmanSuiteId: suite._id.toString() });

    await flushAsync();

    expect(postmanRunner.runSuite).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionFileUrl: 'http://minio.local/bucket/collection-v1.json',
        environmentFileUrl: 'http://minio.local/bucket/environment-v1.json',
      }),
      expect.objectContaining({ triggerType: 'retry' }),
    );

    const retryRuns = await AutomationRun.find({ triggerType: 'retry' });
    expect(retryRuns).toHaveLength(1);
    expect(retryRuns[0]).toMatchObject({
      postmanSuiteId: suite._id,
      collectionVersion: 1,
      environmentVersion: 1,
    });
  });

  test('rejects retrying a run that has no postmanSuiteId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    s3Client.uploadObject.mockResolvedValue('http://minio.local/bucket/x.json');

    const manualRun = await persistAutomationRun({
      projectId: 'proj-1',
      tool: 'newman',
      triggeredBy: 'user-1',
      rawReportUrl: 'http://minio.local/bucket/manual.json',
      summary: sampleSummary,
      testResults: [],
    });

    const res = await request(app)
      .post(`/execution/automation-runs/${manualRun._id}/retry`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(400);
    expect(postmanRunner.runSuite).not.toHaveBeenCalled();
  });

  test('returns 404 for a non-existent automation run', async () => {
    const res = await request(app)
      .post('/execution/automation-runs/64b6f7e2f1a2b3c4d5e6f7a8/retry')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });

  test('rejects when the Suite is no longer active', async () => {
    const suite = await createSuiteAtVersion2();
    await PostmanSuite.findByIdAndUpdate(suite._id, { isActive: false });
    const originalRun = await persistAutomationRun({
      projectId: 'proj-1',
      tool: 'newman',
      triggeredBy: 'scheduler',
      postmanSuiteId: suite._id,
      triggerType: 'scheduled',
      collectionVersion: 2,
      rawReportUrl: 'http://minio.local/bucket/original-run.json',
      summary: sampleSummary,
      testResults: sampleTestResults,
    });

    const res = await request(app)
      .post(`/execution/automation-runs/${originalRun._id}/retry`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(400);
  });

  test('rejects with 409 when the Suite is already running', async () => {
    const suite = await createSuiteAtVersion2();
    const originalRun = await persistAutomationRun({
      projectId: 'proj-1',
      tool: 'newman',
      triggeredBy: 'scheduler',
      postmanSuiteId: suite._id,
      triggerType: 'scheduled',
      collectionVersion: 2,
      environmentVersion: 2,
      rawReportUrl: 'http://minio.local/bucket/original-run.json',
      summary: sampleSummary,
      testResults: sampleTestResults,
    });
    postmanRunner.isSuiteRunning.mockReturnValue(true);

    const res = await request(app)
      .post(`/execution/automation-runs/${originalRun._id}/retry`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(409);
    expect(postmanRunner.runSuite).not.toHaveBeenCalled();
  });

  test('rejects with 409 when the original collection version is no longer available', async () => {
    const suite = await createSuiteAtVersion2();
    // Points at a version that was never recorded (simulates the version
    // history having been pruned/lost out of band).
    const originalRun = await persistAutomationRun({
      projectId: 'proj-1',
      tool: 'newman',
      triggeredBy: 'scheduler',
      postmanSuiteId: suite._id,
      triggerType: 'scheduled',
      collectionVersion: 99,
      rawReportUrl: 'http://minio.local/bucket/original-run.json',
      summary: sampleSummary,
      testResults: sampleTestResults,
    });
    postmanRunner.isSuiteRunning.mockReturnValue(false);

    const res = await request(app)
      .post(`/execution/automation-runs/${originalRun._id}/retry`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(409);
    expect(postmanRunner.runSuite).not.toHaveBeenCalled();
  });
});
