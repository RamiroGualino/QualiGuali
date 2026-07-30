jest.mock('../../src/clients/projectsClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { createUser, tokenFor } = require('../helpers/factories');
const { ROLES } = require('@qualiguali/shared');
const projectsClient = require('../../src/clients/projectsClient');

const app = createApp();

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.clearAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('/users', () => {
  describe('GET /users', () => {
    test('a Super Admin can list users', async () => {
      const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
      const token = tokenFor(superAdmin);
      await createUser({ email: 'qa@qg.com', role: ROLES.QA_ENGINEER });

      const res = await request(app).get('/users').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(2);
    });

    test('an Admin cannot list users', async () => {
      const admin = await createUser({ email: 'admin@qg.com', role: ROLES.ADMIN });
      const token = tokenFor(admin);

      const res = await request(app).get('/users').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    test('rejects requests without a token', async () => {
      const res = await request(app).get('/users');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /users', () => {
    test('a Super Admin can create a user with a name and assigned projects', async () => {
      const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
      const token = tokenFor(superAdmin);
      projectsClient.validateProjectIds.mockResolvedValue();

      const res = await request(app)
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New QA',
          email: 'new-qa@qg.com',
          password: 'Password123!',
          role: ROLES.QA_ENGINEER,
          assignedProjectIds: ['proj-1'],
        });

      expect(res.status).toBe(201);
      expect(res.body.user.name).toBe('New QA');
      expect(res.body.user.assignedProjectIds).toEqual(['proj-1']);
      expect(projectsClient.validateProjectIds).toHaveBeenCalledWith(['proj-1'], `Bearer ${token}`);
    });

    test('rejects an invalid assigned project id', async () => {
      const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
      const token = tokenFor(superAdmin);
      const err = new Error('Project "ghost" does not exist');
      err.status = 400;
      projectsClient.validateProjectIds.mockRejectedValue(err);

      const res = await request(app)
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'New QA',
          email: 'new-qa@qg.com',
          password: 'Password123!',
          role: ROLES.QA_ENGINEER,
          assignedProjectIds: ['ghost'],
        });

      expect(res.status).toBe(400);
    });

    test('cannot create another Super Admin', async () => {
      const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
      const token = tokenFor(superAdmin);

      const res = await request(app).post('/users').set('Authorization', `Bearer ${token}`).send({
        name: 'Another Super',
        email: 'another-super@qg.com',
        password: 'Password123!',
        role: ROLES.SUPER_ADMIN,
      });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /users/:userId', () => {
    test('a Super Admin can edit name, role and assigned projects', async () => {
      const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
      const token = tokenFor(superAdmin);
      const qa = await createUser({ email: 'qa@qg.com', role: ROLES.QA_ENGINEER });
      projectsClient.validateProjectIds.mockResolvedValue();

      const res = await request(app)
        .patch(`/users/${qa._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed', role: ROLES.ADMIN, assignedProjectIds: ['proj-2'] });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Renamed');
      expect(res.body.user.role).toBe(ROLES.ADMIN);
      expect(res.body.user.assignedProjectIds).toEqual(['proj-2']);
    });

    test('cannot edit the Super Admin account', async () => {
      const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
      const token = tokenFor(superAdmin);

      const res = await request(app)
        .patch(`/users/${superAdmin._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed' });

      expect(res.status).toBe(400);
    });

    test('returns 404 for an unknown user', async () => {
      const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
      const token = tokenFor(superAdmin);

      const res = await request(app)
        .patch('/users/64f0000000000000000000aa')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /users/:userId', () => {
    test('soft-deletes (deactivates) a user', async () => {
      const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
      const token = tokenFor(superAdmin);
      const qa = await createUser({ email: 'qa@qg.com', role: ROLES.QA_ENGINEER });

      const res = await request(app)
        .delete(`/users/${qa._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.isActive).toBe(false);
    });

    test('cannot delete the Super Admin account', async () => {
      const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
      const token = tokenFor(superAdmin);

      const res = await request(app)
        .delete(`/users/${superAdmin._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });
  });
});
