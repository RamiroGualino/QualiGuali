jest.mock('../../src/clients/projectsClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
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

describe('GET /test-case-templates', () => {
  test('lazily creates the default template the first time a project is listed', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .get('/test-case-templates?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(1);
    expect(res.body.templates[0].isDefault).toBe(true);
    expect(res.body.templates[0].name).toBe('Default');
  });

  test('does not create a second default template on repeated listing', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    await request(app)
      .get('/test-case-templates?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);
    const res = await request(app)
      .get('/test-case-templates?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.body.templates.filter((t) => t.isDefault)).toHaveLength(1);
  });

  test('requires a projectId query param', async () => {
    const res = await request(app)
      .get('/test-case-templates')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /test-case-templates', () => {
  test('creates a custom template for an existing project', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/test-case-templates')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        name: 'API tests',
        fields: [{ key: 'endpoint', label: 'Endpoint', type: 'text', required: true }],
      });

    expect(res.status).toBe(201);
    expect(res.body.template.isDefault).toBe(false);
  });
});

describe('DELETE /test-case-templates/:id', () => {
  test('cannot delete the default template', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const listRes = await request(app)
      .get('/test-case-templates?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);
    const defaultTemplate = listRes.body.templates[0];

    const res = await request(app)
      .delete(`/test-case-templates/${defaultTemplate._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(400);
  });

  test('can delete a non-default template', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const created = await request(app)
      .post('/test-case-templates')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', name: 'Extra' });

    const res = await request(app)
      .delete(`/test-case-templates/${created.body.template._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(204);
  });
});
