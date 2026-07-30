const fs = require('fs');
const path = require('path');
const { parseAllureResults, isAllureResult } = require('../../src/parsers/allureParser');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '../__fixtures__/allure', name), 'utf8'));
}

describe('isAllureResult', () => {
  test('recognizes a valid Allure result object', () => {
    expect(isAllureResult(loadFixture('passed.json'))).toBe(true);
  });

  test('rejects a non-Allure object', () => {
    expect(isAllureResult({ run: {} })).toBe(false);
    expect(isAllureResult(null)).toBe(false);
  });
});

describe('parseAllureResults', () => {
  test('aggregates summary counts across passed/failed/skipped tests', () => {
    const files = [
      loadFixture('passed.json'),
      loadFixture('failed.json'),
      loadFixture('skipped.json'),
    ];

    const { summary, testResults } = parseAllureResults(files);

    expect(summary).toMatchObject({ total: 3, passed: 1, failed: 1, broken: 0, skipped: 1 });
    expect(summary.executedAt).toEqual(new Date(1700000000000));
    expect(testResults).toHaveLength(3);
  });

  test('extracts suiteName from the "suite" label', () => {
    const { testResults } = parseAllureResults([loadFixture('passed.json')]);
    expect(testResults[0].suiteName).toBe('Login Suite');
  });

  test('extracts errorMessage and stackTraceExcerpt for a failed test', () => {
    const { testResults } = parseAllureResults([loadFixture('failed.json')]);
    const failed = testResults.find((t) => t.status === 'failed');
    expect(failed.errorMessage).toBe('Expected error banner to be visible');
    expect(failed.stackTraceExcerpt).toMatch(/AssertionError/);
  });

  test('truncates a long stack trace to 2000 characters', () => {
    const longTrace = 'x'.repeat(5000);
    const result = {
      uuid: 'u1',
      name: 'Test with a huge trace',
      status: 'broken',
      statusDetails: { message: 'boom', trace: longTrace },
      start: 1,
      stop: 2,
      labels: [{ name: 'suite', value: 'Suite' }],
    };

    const { testResults } = parseAllureResults([result]);
    expect(testResults[0].stackTraceExcerpt).toHaveLength(2000);
  });

  test('computes durationMs as the overall wall-clock span (earliest start to latest stop)', () => {
    const { summary } = parseAllureResults([
      loadFixture('passed.json'),
      loadFixture('failed.json'),
    ]);
    expect(summary.durationMs).toBe(1700000003500 - 1700000000000);
  });

  test('defaults suiteName to "Unknown suite" when no suite label is present', () => {
    const result = {
      uuid: 'u2',
      name: 'No suite label',
      status: 'passed',
      statusDetails: {},
      start: 1,
      stop: 2,
      labels: [],
    };
    const { testResults } = parseAllureResults([result]);
    expect(testResults[0].suiteName).toBe('Unknown suite');
  });

  test('throws a 400-flagged error for an unrecognized status', () => {
    const result = {
      uuid: 'u3',
      name: 'Bad status',
      status: 'weird',
      start: 1,
      stop: 2,
      labels: [],
    };
    expect(() => parseAllureResults([result])).toThrow(/Unrecognized Allure test status/);
  });

  test('throws a 400-flagged error when given no results', () => {
    expect(() => parseAllureResults([])).toThrow(/No Allure result files/);
  });
});
