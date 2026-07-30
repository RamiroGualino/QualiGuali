const request = require('supertest');
const express = require('express');
const { createCors } = require('../../src/middleware/cors');

function buildApp() {
  const app = express();
  app.use(createCors());
  app.get('/ping', (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe('createCors', () => {
  const originalEnv = process.env.CORS_ORIGIN;

  afterEach(() => {
    process.env.CORS_ORIGIN = originalEnv;
  });

  test('reflects the request origin when CORS_ORIGIN is not configured', async () => {
    delete process.env.CORS_ORIGIN;
    const app = buildApp();

    const res = await request(app).get('/ping').set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('only allows origins from CORS_ORIGIN when configured', async () => {
    process.env.CORS_ORIGIN = 'http://allowed.example.com';
    const app = buildApp();

    const allowed = await request(app).get('/ping').set('Origin', 'http://allowed.example.com');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://allowed.example.com');

    const blocked = await request(app).get('/ping').set('Origin', 'http://blocked.example.com');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});
