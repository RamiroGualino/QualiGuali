jest.mock('../../src/clients/projectsClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const { createTestCase } = require('../helpers/factories');
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

describe('POST /test-plans', () => {
  test('creates a test plan for an existing project', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/test-plans')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', name: 'Regression suite' });

    expect(res.status).toBe(201);
    expect(res.body.testPlan.status).toBe('draft');
  });

  test('rejects when the project does not exist', async () => {
    projectsClient.getProject.mockResolvedValue(null);

    const res = await request(app)
      .post('/test-plans')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'missing', name: 'Orphan plan' });

    expect(res.status).toBe(400);
  });
});

describe('POST /test-plans/:id/test-cases', () => {
  test('adds existing test cases from the same project to a plan', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const plan = await request(app)
      .post('/test-plans')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', name: 'Smoke suite' });
    const testCase = await createTestCase('proj-1', { title: 'Smoke case' });

    const res = await request(app)
      .post(`/test-plans/${plan.body.testPlan._id}/test-cases`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ testCaseIds: [testCase._id] });

    expect(res.status).toBe(200);
    expect(res.body.testPlan.testCaseIds).toContain(testCase._id);
  });

  test('rejects a test case that belongs to a different project', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const plan = await request(app)
      .post('/test-plans')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', name: 'Plan A' });

    projectsClient.getProject.mockResolvedValue({ _id: 'proj-2' });
    const otherProjectCase = await createTestCase('proj-2', { title: 'Other project case' });

    const res = await request(app)
      .post(`/test-plans/${plan.body.testPlan._id}/test-cases`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ testCaseIds: [otherProjectCase._id] });

    expect(res.status).toBe(400);
  });

  test('rejects an empty testCaseIds array', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const plan = await request(app)
      .post('/test-plans')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', name: 'Plan B' });

    const res = await request(app)
      .post(`/test-plans/${plan.body.testPlan._id}/test-cases`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ testCaseIds: [] });

    expect(res.status).toBe(400);
  });
});
