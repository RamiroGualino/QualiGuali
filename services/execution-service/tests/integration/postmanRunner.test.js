const express = require('express');
const { runSuite } = require('../../src/services/postmanRunner.service');
const collectionFixture = require('../__fixtures__/postman/valid-collection.json');

// Real end-to-end run: no mocked "newman", no mocked fetch — an embedded
// Express server plays every role at once (same approach the etapa-3
// design doc calls for): it hosts the collection/environment JSON *and* is
// the actual target the collection's request hits. Proves the real
// newman.run() -> parseNewmanReport() pipeline agrees on the report shape,
// not just that the mocked unit test's assumptions about that shape hold.
//
// Reuses Etapa 2's valid-collection.json fixture (a single "GET
// {{baseUrl}}/health" request) rather than adding a near-duplicate
// sample-collection.json — there's no separate static environment fixture
// either, since the environment has to point at this server's own
// ephemeral port, which isn't known until it's actually listening.
describe('runSuite (integration, real Newman execution)', () => {
  let server;
  let baseUrl;
  let currentCollection;

  beforeAll(async () => {
    const app = express();
    app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
    app.get('/collection.json', (_req, res) => res.json(currentCollection));
    app.get('/environment.json', (_req, res) =>
      res.json({ values: [{ key: 'baseUrl', value: baseUrl, enabled: true }] }),
    );

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  // Tests run sequentially within this file (Jest's default), so sharing
  // `currentCollection` and re-pointing the same two routes per test is
  // safe — no need to spin up a fresh server per case.
  function suiteFor({ collection, withEnvironment = true, id = 'integration-suite' }) {
    currentCollection = collection;
    return {
      _id: id,
      collectionFileUrl: `${baseUrl}/collection.json`,
      environmentFileUrl: withEnvironment ? `${baseUrl}/environment.json` : null,
      timeoutMs: 10000,
    };
  }

  test('runs a real collection against a local target and produces a report parseNewmanReport accepts', async () => {
    const suite = suiteFor({ collection: collectionFixture });

    const result = await runSuite(suite, { triggerType: 'manual', triggeredBy: 'user-1' });

    expect(result.status).toBe('completed');
    expect(result.summary.total).toBe(1);
    expect(result.summary.passed).toBe(1);
    expect(result.summary.failed).toBe(0);
    expect(result.testResults).toHaveLength(1);
    expect(result.testResults[0].status).toBe('passed');
    expect(result.testResults[0].testName).toBe('GET /health');

    // Etapa 4: request/response/log detail, captured from the real Newman
    // run rather than a mock — proves extractRequestDetails()'s field paths
    // (request.headers.toJSON(), response.text(), etc.) hold against an
    // actual Newman SDK object, not just the shapes a unit test assumes.
    const [testResult] = result.testResults;
    expect(testResult.method).toBe('GET');
    expect(testResult.url).toContain('/health');
    expect(testResult.responseStatus).toBe(200);
    expect(testResult.responseBody).toContain('"ok":true');
    expect(Array.isArray(testResult.requestHeaders)).toBe(true);
    expect(Array.isArray(testResult.responseHeaders)).toBe(true);
    expect(Array.isArray(testResult.logs)).toBe(true);
  }, 15000);

  test('never throws for a collection whose request target is unreachable', async () => {
    const brokenCollection = {
      ...collectionFixture,
      item: [
        {
          name: 'GET nowhere',
          request: { method: 'GET', url: { raw: 'http://127.0.0.1:1/unreachable' } },
        },
      ],
    };
    const suite = suiteFor({
      collection: brokenCollection,
      withEnvironment: false,
      id: 'integration-suite-broken',
    });

    const result = await runSuite(suite, { triggerType: 'manual', triggeredBy: 'user-1' });

    // What matters here is that this resolves to *some* descriptive result
    // instead of throwing — whether Newman classifies an unreachable
    // request target as a failed execution (still "completed" as a run) or
    // as a run-level error is an internal Newman detail this test doesn't
    // pin down either way.
    expect(['completed', 'failed']).toContain(result.status);
    if (result.status === 'completed') {
      expect(result.testResults).toHaveLength(1);
    } else {
      expect(result.reason).toBe('execution_error');
    }
  }, 15000);
});
