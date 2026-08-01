const { compareRuns } = require('../../src/services/compareRuns.service');

function testResult(overrides) {
  return { suiteName: 'Smoke API', testName: 'GET /health', status: 'passed', ...overrides };
}

describe('compareRuns', () => {
  test('returns an empty array for two empty runs', () => {
    expect(compareRuns([], [])).toEqual([]);
  });

  test('marks a test only present in run B as new', () => {
    const diff = compareRuns([], [testResult({ testName: 'POST /login' })]);
    expect(diff).toEqual([
      expect.objectContaining({
        testName: 'POST /login',
        statusA: null,
        statusB: 'passed',
        isNew: true,
        isRemoved: false,
        regression: false,
        fixed: false,
      }),
    ]);
  });

  test('marks a test only present in run A as removed', () => {
    const diff = compareRuns([testResult({ testName: 'DELETE /session' })], []);
    expect(diff).toEqual([
      expect.objectContaining({
        testName: 'DELETE /session',
        statusA: 'passed',
        statusB: null,
        isNew: false,
        isRemoved: true,
        regression: false,
        fixed: false,
      }),
    ]);
  });

  test('flags a regression: passed in A, failed in B', () => {
    const diff = compareRuns(
      [testResult({ status: 'passed' })],
      [testResult({ status: 'failed' })],
    );
    expect(diff).toEqual([
      expect.objectContaining({
        statusA: 'passed',
        statusB: 'failed',
        regression: true,
        fixed: false,
      }),
    ]);
  });

  test('treats "broken" the same as "failed" for regression purposes', () => {
    const diff = compareRuns(
      [testResult({ status: 'passed' })],
      [testResult({ status: 'broken' })],
    );
    expect(diff[0]).toMatchObject({ regression: true });
  });

  test('flags a fix: failed in A, passed in B', () => {
    const diff = compareRuns(
      [testResult({ status: 'failed' })],
      [testResult({ status: 'passed' })],
    );
    expect(diff).toEqual([
      expect.objectContaining({
        statusA: 'failed',
        statusB: 'passed',
        regression: false,
        fixed: true,
      }),
    ]);
  });

  test('a test that stays passed is neither a regression nor a fix', () => {
    const diff = compareRuns([testResult()], [testResult()]);
    expect(diff).toEqual([
      expect.objectContaining({ regression: false, fixed: false, isNew: false, isRemoved: false }),
    ]);
  });

  test('a test that stays failed is neither a regression nor a fix', () => {
    const diff = compareRuns(
      [testResult({ status: 'failed' })],
      [testResult({ status: 'failed' })],
    );
    expect(diff).toEqual([expect.objectContaining({ regression: false, fixed: false })]);
  });

  test('disambiguates same-named tests in different suites', () => {
    const diff = compareRuns(
      [
        testResult({ suiteName: 'Suite A', testName: 'GET /ping', status: 'passed' }),
        testResult({ suiteName: 'Suite B', testName: 'GET /ping', status: 'passed' }),
      ],
      [
        testResult({ suiteName: 'Suite A', testName: 'GET /ping', status: 'failed' }),
        testResult({ suiteName: 'Suite B', testName: 'GET /ping', status: 'passed' }),
      ],
    );

    expect(diff).toHaveLength(2);
    const suiteARow = diff.find((row) => row.suiteName === 'Suite A');
    const suiteBRow = diff.find((row) => row.suiteName === 'Suite B');
    expect(suiteARow.regression).toBe(true);
    expect(suiteBRow.regression).toBe(false);
  });

  test('defaults missing test lists to empty arrays rather than throwing', () => {
    expect(() => compareRuns()).not.toThrow();
    expect(compareRuns()).toEqual([]);
  });
});
