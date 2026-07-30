const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();

const superAdminToken = () => tokenFor({ role: ROLES.SUPER_ADMIN });
const adminToken = () => tokenFor({ role: ROLES.ADMIN });
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

describe('POST /projects', () => {
  test('an Admin can create a project', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'QualiGuali Core' });

    expect(res.status).toBe(201);
    expect(res.body.project.name).toBe('QualiGuali Core');
    expect(res.body.project.status).toBe('active');
  });

  test('a Super Admin can create a project', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ name: 'Another project' });

    expect(res.status).toBe(201);
  });

  test('a QA Engineer cannot create a project', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ name: 'Should fail' });

    expect(res.status).toBe(403);
  });

  test('rejects requests without a token', async () => {
    const res = await request(app).post('/projects').send({ name: 'No token' });
    expect(res.status).toBe(401);
  });

  test('rejects a missing name with 400', async () => {
    const res = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /projects and /projects/:id', () => {
  test('any authenticated role can list and read projects', async () => {
    await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Readable project' });

    const list = await request(app).get('/projects').set('Authorization', `Bearer ${qaToken()}`);
    expect(list.status).toBe(200);
    expect(list.body.projects).toHaveLength(1);

    const projectId = list.body.projects[0]._id;
    const single = await request(app)
      .get(`/projects/${projectId}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(single.status).toBe(200);
    expect(single.body.project.name).toBe('Readable project');
  });

  test('returns 404 for a non-existent project id', async () => {
    const res = await request(app)
      .get('/projects/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });

  test('returns 404 for a malformed project id', async () => {
    const res = await request(app)
      .get('/projects/not-an-object-id')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /projects/:id', () => {
  test('an Admin can archive a project', async () => {
    const created = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'To archive' });

    const res = await request(app)
      .patch(`/projects/${created.body.project._id}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ status: 'archived' });

    expect(res.status).toBe(200);
    expect(res.body.project.status).toBe('archived');
  });

  test('a QA Engineer cannot update a project', async () => {
    const created = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'Protected' });

    const res = await request(app)
      .patch(`/projects/${created.body.project._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'archived' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /projects/:id', () => {
  test('an Admin can delete a project', async () => {
    const created = await request(app)
      .post('/projects')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ name: 'To delete' });

    const res = await request(app)
      .delete(`/projects/${created.body.project._id}`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(204);

    const getRes = await request(app)
      .get(`/projects/${created.body.project._id}`)
      .set('Authorization', `Bearer ${adminToken()}`);
    expect(getRes.status).toBe(404);
  });
});
