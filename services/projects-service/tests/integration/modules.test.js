const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();

const adminToken = () => tokenFor({ role: ROLES.ADMIN });
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

async function createProject() {
  const res = await request(app)
    .post('/projects')
    .set('Authorization', `Bearer ${adminToken()}`)
    .send({ name: 'Project with modules' });
  return res.body.project;
}

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

describe('POST /projects/:projectId/modules', () => {
  test('an Admin can create a module under a project', async () => {
    const project = await createProject();

    const res = await request(app)
      .post(`/projects/${project._id}/modules`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Checkout', order: 1 });

    expect(res.status).toBe(201);
    expect(res.body.module.name).toBe('Checkout');
    expect(res.body.module.projectId).toBe(project._id);
  });

  test('a QA Engineer cannot create a module', async () => {
    const project = await createProject();

    const res = await request(app)
      .post(`/projects/${project._id}/modules`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ name: 'Should fail' });

    expect(res.status).toBe(403);
  });

  test('returns 404 when the parent project does not exist', async () => {
    const res = await request(app)
      .post('/projects/64b6f7e2f1a2b3c4d5e6f7a8/modules')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Orphan module' });

    expect(res.status).toBe(404);
  });
});

describe('GET /projects/:projectId/modules', () => {
  test('lists modules sorted by order', async () => {
    const project = await createProject();
    await request(app)
      .post(`/projects/${project._id}/modules`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Second', order: 2 });
    await request(app)
      .post(`/projects/${project._id}/modules`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'First', order: 1 });

    const res = await request(app)
      .get(`/projects/${project._id}/modules`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.modules.map((m) => m.name)).toEqual(['First', 'Second']);
  });
});

describe('GET /projects/:projectId/modules/:moduleId', () => {
  test('a module from a different project is not found', async () => {
    const projectA = await createProject();
    const projectB = await createProject();

    const created = await request(app)
      .post(`/projects/${projectA._id}/modules`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'A-only module' });

    const res = await request(app)
      .get(`/projects/${projectB._id}/modules/${created.body.module._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /projects/:projectId/modules/:moduleId', () => {
  test('an Admin can delete a module', async () => {
    const project = await createProject();
    const created = await request(app)
      .post(`/projects/${project._id}/modules`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'To delete' });

    const res = await request(app)
      .delete(`/projects/${project._id}/modules/${created.body.module._id}`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(204);

    const getRes = await request(app)
      .get(`/projects/${project._id}/modules/${created.body.module._id}`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(getRes.status).toBe(404);
  });
});
