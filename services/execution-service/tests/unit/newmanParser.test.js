const fs = require('fs');
const path = require('path');
const { parseNewmanReport, isNewmanReport } = require('../../src/parsers/newmanParser');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../__fixtures__/newman', name), 'utf8'));
}

describe('isNewmanReport', () => {
  test('recognizes a valid Newman JSON report', () => {
    expect(isNewmanReport(loadFixture('all-passed.json'))).toBe(true);
  });

  test('rejects a non-Newman object', () => {
    expect(isNewmanReport({ foo: 'bar' })).toBe(false);
    expect(isNewmanReport(null)).toBe(false);
  });
});

describe('parseNewmanReport', () => {
  test('summarizes an all-passing run', () => {
    const { summary, testResults } = parseNewmanReport(loadFixture('all-passed.json'));

    expect(summary).toMatchObject({ total: 2, passed: 2, failed: 0, broken: 0, skipped: 0 });
    expect(summary.durationMs).toBe(200);
    expect(summary.executedAt).toEqual(new Date(1700000010000));
    expect(testResults).toHaveLength(2);
  });

  test('marks an execution as failed when any of its assertions has an error', () => {
    const { summary, testResults } = parseNewmanReport(loadFixture('with-failures.json'));

    expect(summary).toMatchObject({ total: 2, passed: 1, failed: 1, broken: 0, skipped: 0 });

    const failedTest = testResults.find((t) => t.status === 'failed');
    expect(failedTest.testName).toBe('POST /payments');
    expect(failedTest.errorMessage).toMatch(/paymentId/);
    expect(failedTest.stackTraceExcerpt).toMatch(/AssertionError/);

    const passedTest = testResults.find((t) => t.status === 'passed');
    expect(passedTest.testName).toBe('GET /health');
  });

  test('uses the collection name as suiteName for every execution', () => {
    const { testResults } = parseNewmanReport(loadFixture('all-passed.json'));
    expect(testResults.every((t) => t.suiteName === 'Payments API')).toBe(true);
  });

  test('throws a 400-flagged error for a non-Newman payload', () => {
    expect(() => parseNewmanReport({ foo: 'bar' })).toThrow(/does not look like a Newman/);
  });

  test('throws a 400-flagged error when run.timings.started is missing', () => {
    const broken = loadFixture('all-passed.json');
    delete broken.run.timings;
    expect(() => parseNewmanReport(broken)).toThrow(/run.timings.started/);
  });
});
