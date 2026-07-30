jest.mock('../../src/clients/projectsClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const { createRequirement, createTestSuite, createTestCase } = require('../helpers/factories');
const projectsClient = require('../../src/clients/projectsClient');
const TestCase = require('../../src/models/TestCase');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('POST /test-suites', () => {
  test('creates a test suite under an existing requirement', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const requirement = await createRequirement('proj-1');

    const res = await request(app)
      .post('/test-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', requirementId: requirement._id, name: 'Login suite' });

    expect(res.status).toBe(201);
    expect(res.body.testSuite.name).toBe('Login suite');
    expect(res.body.testSuite.requirementId).toBe(requirement._id);
  });

  test('rejects an unknown requirementId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/test-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', requirementId: '64b6f7e2f1a2b3c4d5e6f7a8', name: 'Orphan' });

    expect(res.status).toBe(400);
  });

  test('rejects a requirement that belongs to a different project', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const requirement = await createRequirement('proj-1');

    const res = await request(app)
      .post('/test-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-2', requirementId: requirement._id, name: 'Cross-project' });

    expect(res.status).toBe(400);
  });

  test('rejects a missing name with 400', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const requirement = await createRequirement('proj-1');

    const res = await request(app)
      .post('/test-suites')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', requirementId: requirement._id });

    expect(res.status).toBe(400);
  });
});

describe('GET /test-suites', () => {
  test('filters by requirementId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const reqA = await createRequirement('proj-1', { title: 'Req A' });
    const reqB = await createRequirement('proj-1', { title: 'Req B' });
    await createTestSuite('proj-1', reqA._id, { name: 'Suite A' });
    await createTestSuite('proj-1', reqB._id, { name: 'Suite B' });

    const res = await request(app)
      .get(`/test-suites?requirementId=${reqA._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.testSuites).toHaveLength(1);
    expect(res.body.testSuites[0].name).toBe('Suite A');
  });

  test('filters by projectId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const requirement = await createRequirement('proj-1');
    await createTestSuite('proj-1', requirement._id);

    const res = await request(app)
      .get('/test-suites?projectId=proj-2')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.testSuites).toHaveLength(0);
  });
});

describe('DELETE /test-suites/:id', () => {
  test('cascades: deleting a suite also deletes its test cases', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const requirement = await createRequirement('proj-1');
    const suite = await createTestSuite('proj-1', requirement._id);
    const testCase = await createTestCase('proj-1', { suiteId: suite._id });

    const res = await request(app)
      .delete(`/test-suites/${suite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(204);
    expect(await TestCase.findById(testCase._id)).toBeNull();
  });

  test('deletes an empty suite', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const requirement = await createRequirement('proj-1');
    const suite = await createTestSuite('proj-1', requirement._id);

    const res = await request(app)
      .delete(`/test-suites/${suite._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(204);
  });
});
