jest.mock('../../src/clients/projectsClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const { createRequirement, createTestSuite, createTestCase } = require('../helpers/factories');
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

describe('POST /requirements', () => {
  test('creates a requirement with an auto-generated code when the project exists', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1', name: 'Demo' });

    const res = await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Users can log in' });

    expect(res.status).toBe(201);
    expect(res.body.requirement.code).toBe('REQ-001');
    expect(projectsClient.getProject).toHaveBeenCalledWith('proj-1', expect.any(String));
  });

  test('assigns sequential codes per project', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const first = await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'First' });
    const second = await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Second' });

    expect(first.body.requirement.code).toBe('REQ-001');
    expect(second.body.requirement.code).toBe('REQ-002');
  });

  test('rejects when the project does not exist in projects-service', async () => {
    projectsClient.getProject.mockResolvedValue(null);

    const res = await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'missing-project', title: 'Orphan requirement' });

    expect(res.status).toBe(400);
  });

  test('rejects when the module does not belong to the project', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    projectsClient.getModule.mockResolvedValue(null);

    const res = await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', moduleId: 'bad-module', title: 'Bad module ref' });

    expect(res.status).toBe(400);
  });

  test('rejects requests without a token', async () => {
    const res = await request(app)
      .post('/requirements')
      .send({ projectId: 'proj-1', title: 'No token' });
    expect(res.status).toBe(401);
  });

  test('rejects a missing title with 400', async () => {
    const res = await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1' });
    expect(res.status).toBe(400);
  });

  test('persists an optional jiraUrl', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        title: 'Linked to Jira',
        jiraUrl: 'https://jira.example.com/browse/QG-42',
      });

    expect(res.status).toBe(201);
    expect(res.body.requirement.jiraUrl).toBe('https://jira.example.com/browse/QG-42');
  });
});

describe('PATCH /requirements/:id', () => {
  test('updates jiraUrl', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const requirement = await createRequirement('proj-1');

    const res = await request(app)
      .patch(`/requirements/${requirement._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ jiraUrl: 'https://jira.example.com/browse/QG-99' });

    expect(res.status).toBe(200);
    expect(res.body.requirement.jiraUrl).toBe('https://jira.example.com/browse/QG-99');
  });

  test('returns 404 for a non-existent requirement', async () => {
    const res = await request(app)
      .patch('/requirements/000000000000000000000000')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ title: 'Anything' });
    expect(res.status).toBe(404);
  });
});

describe('GET /requirements', () => {
  test('lists requirements, optionally filtered by projectId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Req A' });
    await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-2', title: 'Req B' });

    const res = await request(app)
      .get('/requirements?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.requirements).toHaveLength(1);
    expect(res.body.requirements[0].title).toBe('Req A');
  });

  test('filters by moduleId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    projectsClient.getModule.mockResolvedValue({ _id: 'module-1', projectId: 'proj-1' });
    await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', moduleId: 'module-1', title: 'In module 1' });
    await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'No module' });

    const res = await request(app)
      .get('/requirements?projectId=proj-1&moduleId=module-1')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.requirements).toHaveLength(1);
    expect(res.body.requirements[0].title).toBe('In module 1');
  });
});

describe('GET /requirements/:id/test-cases', () => {
  test('resolves test cases transitively through the requirement’s suites', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const requirement = await createRequirement('proj-1');
    const suite = await createTestSuite('proj-1', requirement._id);
    const testCase = await createTestCase('proj-1', { suiteId: suite._id });

    const res = await request(app)
      .get(`/requirements/${requirement._id}/test-cases`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.testCases).toHaveLength(1);
    expect(res.body.testCases[0]._id).toBe(testCase._id);
  });

  test('returns 404 for a non-existent requirement', async () => {
    const res = await request(app)
      .get('/requirements/64b6f7e2f1a2b3c4d5e6f7a8/test-cases')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /requirements/:id', () => {
  test('returns 404 for a non-existent requirement', async () => {
    const res = await request(app)
      .get('/requirements/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /requirements/:id', () => {
  test('deletes an existing requirement', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const created = await request(app)
      .post('/requirements')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'To delete' });

    const res = await request(app)
      .delete(`/requirements/${created.body.requirement._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(204);

    const getRes = await request(app)
      .get(`/requirements/${created.body.requirement._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(getRes.status).toBe(404);
  });

  test('rejects deleting a requirement that still has test suites', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const requirement = await createRequirement('proj-1');
    await createTestSuite('proj-1', requirement._id);

    const res = await request(app)
      .delete(`/requirements/${requirement._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(409);
  });
});
