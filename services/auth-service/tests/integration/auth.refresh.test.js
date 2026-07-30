const request = require('supertest');
const createApp = require('../../src/app');

const app = createApp();

describe('POST /auth/refresh', () => {
  test('is explicitly marked as not implemented (TODO for a future part)', async () => {
    const res = await request(app).post('/auth/refresh');

    expect(res.status).toBe(501);
    expect(res.body.message).toMatch(/TODO/);
  });
});
