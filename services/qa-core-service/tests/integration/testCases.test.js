jest.mock('../../src/clients/projectsClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const { createRequirementWithSuite } = require('../helpers/factories');
const projectsClient = require('../../src/clients/projectsClient');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('POST /test-cases', () => {
  test('falls back to the project default template when templateId is omitted', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite } = await createRequirementWithSuite('proj-1');

    const res = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', suiteId: testSuite._id, title: 'Login works' });

    expect(res.status).toBe(201);
    expect(res.body.testCase.code).toBe('TC-001');
    expect(res.body.testCase.templateId).toEqual(expect.any(String));
    expect(res.body.testCase.suiteId).toBe(testSuite._id);
    expect(res.body.testCase.priority).toBe('medium');
  });

  test('accepts an explicit priority and lets it be updated', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite } = await createRequirementWithSuite('proj-1');

    const created = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        suiteId: testSuite._id,
        title: 'Critical path',
        priority: 'critical',
      });
    expect(created.status).toBe(201);
    expect(created.body.testCase.priority).toBe('critical');

    const updated = await request(app)
      .patch(`/test-cases/${created.body.testCase._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ priority: 'low' });
    expect(updated.status).toBe(200);
    expect(updated.body.testCase.priority).toBe('low');
  });

  test('stores and updates the Kualitee-style additional fields', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite } = await createRequirementWithSuite('proj-1');

    const created = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        suiteId: testSuite._id,
        title: 'Checkout flow',
        summary: 'Verifies the full checkout flow',
        expectedResult: 'Order is placed successfully',
        postconditions: 'Order appears in the order history',
        comments: 'Flaky on slow networks',
        build: 'v1.2.0',
        scenarioName: 'Checkout',
        scenarioSummary: 'All checkout-related cases',
        executionType: 'automated',
        testingType: 'regression',
        estimatedTime: 15,
        assignee: 'QA Engineer',
        automationUi: true,
        automationApi: false,
      });

    expect(created.status).toBe(201);
    expect(created.body.testCase).toMatchObject({
      summary: 'Verifies the full checkout flow',
      expectedResult: 'Order is placed successfully',
      postconditions: 'Order appears in the order history',
      comments: 'Flaky on slow networks',
      build: 'v1.2.0',
      scenarioName: 'Checkout',
      scenarioSummary: 'All checkout-related cases',
      executionType: 'automated',
      testingType: 'regression',
      estimatedTime: 15,
      assignee: 'QA Engineer',
      automationUi: true,
      automationApi: false,
    });

    const updated = await request(app)
      .patch(`/test-cases/${created.body.testCase._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        executionType: 'manual',
        estimatedTime: 30,
        assignee: 'Admin User',
        automationUi: false,
        automationApi: true,
      });

    expect(updated.status).toBe(200);
    expect(updated.body.testCase).toMatchObject({
      executionType: 'manual',
      estimatedTime: 30,
      assignee: 'Admin User',
      automationUi: false,
      automationApi: true,
    });
  });

  test('automationUi and automationApi default to false when omitted', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite } = await createRequirementWithSuite('proj-1');

    const created = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', suiteId: testSuite._id, title: 'No automation yet' });

    expect(created.status).toBe(201);
    expect(created.body.testCase).toMatchObject({ automationUi: false, automationApi: false });
  });

  test('allows updating moduleId (unlike suiteId, which is immutable after creation)', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite } = await createRequirementWithSuite('proj-1');

    const created = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', suiteId: testSuite._id, title: 'Needs a module' });

    const updated = await request(app)
      .patch(`/test-cases/${created.body.testCase._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ moduleId: 'module-1' });

    expect(updated.status).toBe(200);
    expect(updated.body.testCase.moduleId).toBe('module-1');
  });

  test('validates customFields against a custom template', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite } = await createRequirementWithSuite('proj-1');

    const templateRes = await request(app)
      .post('/test-case-templates')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        name: 'API tests',
        fields: [{ key: 'endpoint', label: 'Endpoint', type: 'text', required: true }],
      });
    const templateId = templateRes.body.template._id;

    const missingField = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        suiteId: testSuite._id,
        templateId,
        title: 'Missing endpoint',
        customFields: {},
      });
    expect(missingField.status).toBe(400);

    const ok = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        suiteId: testSuite._id,
        templateId,
        title: 'Has endpoint',
        customFields: { endpoint: '/users' },
      });
    expect(ok.status).toBe(201);
    expect(ok.body.testCase.customFields.endpoint).toBe('/users');
  });

  test('rejects an unknown templateId for the project', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite } = await createRequirementWithSuite('proj-1');

    const res = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        suiteId: testSuite._id,
        templateId: '64b6f7e2f1a2b3c4d5e6f7a8',
        title: 'Bad template',
      });

    expect(res.status).toBe(400);
  });

  test('rejects when the project does not exist', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite } = await createRequirementWithSuite('proj-1');
    projectsClient.getProject.mockResolvedValue(null);

    const res = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'missing', suiteId: testSuite._id, title: 'No project' });

    expect(res.status).toBe(400);
  });

  test('rejects a missing suiteId with 400', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'No suite' });

    expect(res.status).toBe(400);
  });

  test('rejects an unknown suiteId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', suiteId: '64b6f7e2f1a2b3c4d5e6f7a8', title: 'Bad suite' });

    expect(res.status).toBe(400);
  });

  test('rejects a suite that belongs to a different project', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite } = await createRequirementWithSuite('proj-1');

    const res = await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-2', suiteId: testSuite._id, title: 'Cross-project case' });

    expect(res.status).toBe(400);
  });
});

describe('GET /test-cases', () => {
  test('filters by suiteId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const { testSuite: suiteA } = await createRequirementWithSuite('proj-1');
    const { testSuite: suiteB } = await createRequirementWithSuite('proj-1');
    await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', suiteId: suiteA._id, title: 'In suite A' });
    await request(app)
      .post('/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', suiteId: suiteB._id, title: 'In suite B' });

    const res = await request(app)
      .get(`/test-cases?suiteId=${suiteA._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.testCases).toHaveLength(1);
    expect(res.body.testCases[0].title).toBe('In suite A');
  });
});
