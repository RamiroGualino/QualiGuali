// Isolated in its own file so the low rate limit doesn't interfere with the
// other login tests (Jest gives each test file a fresh module registry, so
// this env override only affects the app instance built below).
process.env.LOGIN_RATE_LIMIT_MAX = '3';
process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '900000';

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');

const app = createApp();

beforeAll(async () => testDb.connect());
afterAll(async () => testDb.closeDatabase());

describe('POST /auth/login rate limiting', () => {
  test('blocks with 429 after exceeding the configured attempt limit', async () => {
    const attempt = () =>
      request(app).post('/auth/login').send({ email: 'nobody@qg.com', password: 'wrong' });

    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await attempt());
    }

    expect(results.slice(0, 3).every((res) => res.status === 401)).toBe(true);
    expect(results[3].status).toBe(429);
  });
});
