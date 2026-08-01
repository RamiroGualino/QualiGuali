jest.mock('newman');

const newman = require('newman');
const { runSuite, isSuiteRunning } = require('../../src/services/postmanRunner.service');

function fakeSuite(overrides = {}) {
  return {
    _id: 'suite-1',
    collectionFileUrl: 'http://files.local/collection.json',
    environmentFileUrl: 'http://files.local/environment.json',
    timeoutMs: 5000,
    ...overrides,
  };
}

const validNewmanSummary = {
  collection: { info: { name: 'Sample' } },
  run: {
    stats: { assertions: { total: 1 } },
    executions: [
      {
        item: { name: 'GET /health' },
        response: { responseTime: 12 },
        assertions: [],
      },
    ],
    timings: { started: Date.now(), completed: Date.now() + 12 },
  },
};

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
  jest.useRealTimers();
  delete global.fetch;
});

describe('runSuite', () => {
  test('downloads the collection/environment and runs newman with the right options', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ info: { name: 'Collection' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ values: [] }) });

    newman.run.mockImplementation((options, callback) => {
      callback(null, validNewmanSummary);
      return { abort: jest.fn(), on: jest.fn() };
    });

    const result = await runSuite(fakeSuite(), { triggerType: 'manual', triggeredBy: 'user-1' });

    expect(result.status).toBe('completed');
    expect(result.summary.total).toBe(1);
    expect(result.summary.passed).toBe(1);
    expect(result.testResults).toHaveLength(1);
    expect(newman.run).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: { info: { name: 'Collection' } },
        environment: { values: [] },
      }),
      expect.any(Function),
    );
  });

  test('runs without an environment when the suite has none', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { name: 'Collection' } }),
    });
    newman.run.mockImplementation((options, callback) => {
      callback(null, validNewmanSummary);
      return { abort: jest.fn(), on: jest.fn() };
    });

    const result = await runSuite(fakeSuite({ environmentFileUrl: null }), {});

    expect(result.status).toBe('completed');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(newman.run).toHaveBeenCalledWith(
      expect.objectContaining({ environment: undefined }),
      expect.any(Function),
    );
  });

  test('translates a Newman execution error into a failed result, without throwing', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    newman.run.mockImplementation((options, callback) => {
      callback(new Error('boom'), null);
      return { abort: jest.fn(), on: jest.fn() };
    });

    const result = await runSuite(fakeSuite(), {});

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('execution_error');
    expect(result.message).toMatch(/boom/);
  });

  test('translates a timeout into a failed result and calls emitter.abort()', async () => {
    jest.useFakeTimers();
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    const abort = jest.fn();
    newman.run.mockImplementation(() => {
      // Never calls back — simulates a hung/slow execution.
      return { abort, on: jest.fn() };
    });

    const resultPromise = runSuite(fakeSuite({ timeoutMs: 1000 }), {});
    await jest.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('timeout');
    expect(abort).toHaveBeenCalled();
  });

  test('translates a download error into a failed result', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));

    const result = await runSuite(fakeSuite(), {});

    expect(result.status).toBe('failed');
    expect(result.reason).toBe('download_error');
    expect(result.message).toMatch(/network down/);
    expect(newman.run).not.toHaveBeenCalled();
  });

  test('resolves with status "rejected" when the suite is already running, without a second newman.run', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ info: { name: 'x' } }) });
    let capturedCallback;
    newman.run.mockImplementation((options, callback) => {
      capturedCallback = callback;
      return { abort: jest.fn(), on: jest.fn() };
    });

    const suite = fakeSuite({ _id: 'suite-busy', environmentFileUrl: null });
    const firstRun = runSuite(suite, {});

    // The claim happens synchronously at the top of runSuite(), before its
    // first await — no need to wait a tick for this to be observable.
    expect(isSuiteRunning(suite._id)).toBe(true);

    const secondResult = await runSuite(suite, {});
    expect(secondResult.status).toBe('rejected');
    expect(secondResult.reason).toBe('already_running');

    // Let the first run's own chain (fetch -> its json() -> back into
    // fetchJson -> back into runSuite -> newman.run) actually reach
    // newman.run before checking it was called — `await`ing the second
    // call above only guarantees a single microtask tick, not that many.
    await new Promise((resolve) => setImmediate(resolve));
    expect(newman.run).toHaveBeenCalledTimes(1);

    capturedCallback(null, validNewmanSummary);
    const firstResult = await firstRun;
    expect(firstResult.status).toBe('completed');
    expect(isSuiteRunning(suite._id)).toBe(false);
  });

  test('releases the running guard even when the run fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));

    const suite = fakeSuite({ _id: 'suite-cleanup' });
    await runSuite(suite, {});

    expect(isSuiteRunning(suite._id)).toBe(false);
  });
});
