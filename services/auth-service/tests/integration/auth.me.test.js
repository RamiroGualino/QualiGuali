const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { createUser, tokenFor } = require('../helpers/factories');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

describe('GET /auth/me', () => {
  test('returns the authenticated user without the password hash', async () => {
    const user = await createUser({ email: 'qa@qg.com', role: ROLES.QA_ENGINEER });
    const token = tokenFor(user);

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('qa@qg.com');
    expect(res.body.user.role).toBe(ROLES.QA_ENGINEER);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  test('rejects a request with no token', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  test('rejects a malformed token', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });

  test('rejects a token for a user that no longer exists', async () => {
    const user = await createUser({ email: 'ghost@qg.com', role: ROLES.QA_ENGINEER });
    const token = tokenFor(user);
    await user.deleteOne();

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('rejects a token for a now-inactive user', async () => {
    const user = await createUser({ email: 'deactivated@qg.com', role: ROLES.QA_ENGINEER });
    const token = tokenFor(user);
    user.isActive = false;
    await user.save();

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
