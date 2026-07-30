const request = require('supertest');
const jwt = require('jsonwebtoken');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { createUser } = require('../helpers/factories');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

describe('POST /auth/login', () => {
  test('valid credentials return a JWT with userId, role and exp', async () => {
    await createUser({ email: 'qa@qg.com', password: 'Password123!', role: ROLES.QA_ENGINEER });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'qa@qg.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));

    const decoded = jwt.decode(res.body.token);
    expect(decoded.userId).toEqual(expect.any(String));
    expect(decoded.role).toBe(ROLES.QA_ENGINEER);
    expect(typeof decoded.exp).toBe('number');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('login is case-insensitive on email', async () => {
    await createUser({ email: 'qa@qg.com', password: 'Password123!', role: ROLES.QA_ENGINEER });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'QA@QG.com', password: 'Password123!' });

    expect(res.status).toBe(200);
  });

  test('rejects an unknown email with 401', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@qg.com', password: 'Password123!' });

    expect(res.status).toBe(401);
  });

  test('rejects an incorrect password with 401', async () => {
    await createUser({ email: 'qa@qg.com', password: 'Password123!', role: ROLES.QA_ENGINEER });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'qa@qg.com', password: 'WrongPassword' });

    expect(res.status).toBe(401);
  });

  test('rejects an inactive user with 401', async () => {
    await createUser({
      email: 'inactive@qg.com',
      password: 'Password123!',
      role: ROLES.QA_ENGINEER,
      isActive: false,
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'inactive@qg.com', password: 'Password123!' });

    expect(res.status).toBe(401);
  });

  test('rejects a missing email or password with 400', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'qa@qg.com' });
    expect(res.status).toBe(400);
  });
});
