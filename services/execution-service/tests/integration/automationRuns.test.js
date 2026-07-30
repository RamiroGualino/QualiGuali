jest.mock('../../src/clients/projectsClient');
jest.mock('../../src/clients/s3Client');
jest.mock('../../src/services/events');

const path = require('path');
const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const projectsClient = require('../../src/clients/projectsClient');
const s3Client = require('../../src/clients/s3Client');
const events = require('../../src/services/events');
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
