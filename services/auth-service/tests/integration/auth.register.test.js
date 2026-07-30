const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { createUser, tokenFor } = require('../helpers/factories');
const { ROLES } = require('@qualiguali/shared');
const User = require('../../src/models/User');

const app = createApp();

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

describe('POST /auth/register', () => {
  test('a Super Admin can create an Admin', async () => {
    const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
    const token = tokenFor(superAdmin);

    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Admin',
        email: 'new-admin@qg.com',
        password: 'Password123!',
        role: ROLES.ADMIN,
      });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('new-admin@qg.com');
    expect(res.body.user.role).toBe(ROLES.ADMIN);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('a Super Admin can create a QA Engineer', async () => {
    const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
    const token = tokenFor(superAdmin);

    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New QA',
        email: 'new-qa@qg.com',
        password: 'Password123!',
        role: ROLES.QA_ENGINEER,
      });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe(ROLES.QA_ENGINEER);
  });

  test('a Super Admin cannot create another Super Admin', async () => {
    const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
    const token = tokenFor(superAdmin);

    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Another Super',
        email: 'another-super@qg.com',
        password: 'Password123!',
        role: ROLES.SUPER_ADMIN,
      });

    expect(res.status).toBe(403);
  });

  test('an Admin cannot hit the register endpoint', async () => {
    const admin = await createUser({ email: 'admin@qg.com', role: ROLES.ADMIN });
    const token = tokenFor(admin);

    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new-qa@qg.com', password: 'Password123!', role: ROLES.QA_ENGINEER });

    expect(res.status).toBe(403);
  });

  test('a QA Engineer cannot hit the register endpoint', async () => {
    const qa = await createUser({ email: 'qa@qg.com', role: ROLES.QA_ENGINEER });
    const token = tokenFor(qa);

    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'new-qa2@qg.com', password: 'Password123!', role: ROLES.QA_ENGINEER });

    expect(res.status).toBe(403);
  });

  test('rejects requests without a token', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'new-qa@qg.com', password: 'Password123!', role: ROLES.QA_ENGINEER });

    expect(res.status).toBe(401);
  });

  test('rejects a duplicate email with 409', async () => {
    const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
    const token = tokenFor(superAdmin);
    await createUser({ email: 'existing@qg.com', role: ROLES.QA_ENGINEER });

    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Duplicate',
        email: 'existing@qg.com',
        password: 'Password123!',
        role: ROLES.QA_ENGINEER,
      });

    expect(res.status).toBe(409);

    const count = await User.countDocuments({ email: 'existing@qg.com' });
    expect(count).toBe(1);
  });

  test('rejects a missing password with 400', async () => {
    const superAdmin = await createUser({ email: 'super@qg.com', role: ROLES.SUPER_ADMIN });
    const token = tokenFor(superAdmin);

    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Password', email: 'no-password@qg.com', role: ROLES.QA_ENGINEER });

    expect(res.status).toBe(400);
  });
});
