const fs = require('fs');
const path = require('path');
const { detectAndParse, detectTool } = require('../../src/services/automationIngestion.service');

function loadFixture(dir, name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `../__fixtures__/${dir}`, name), 'utf8'));
}

describe('detectTool', () => {
  test('trusts an explicit valid tool', () => {
    expect(detectTool('allure', [])).toBe('allure');
    expect(detectTool('newman', [])).toBe('newman');
  });

  test('rejects an explicit unknown tool', () => {
    expect(() => detectTool('cypress-json', [])).toThrow(/Unknown tool/);
  });

  test('auto-detects newman from a single file matching the Newman shape', () => {
    const file = loadFixture('newman', 'all-passed.json');
    expect(detectTool(undefined, [file])).toBe('newman');
  });

  test('auto-detects allure when every file matches the Allure result shape', () => {
    const files = [loadFixture('allure', 'passed.json'), loadFixture('allure', 'failed.json')];
    expect(detectTool(undefined, files)).toBe('allure');
  });

  test('throws a 400-flagged error for an unrecognized shape', () => {
    try {
      detectTool(undefined, [{ some: 'random json' }]);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/Unrecognized report format/);
    }
  });
});

describe('detectAndParse', () => {
  test('parses Allure files end to end', () => {
    const files = [loadFixture('allure', 'passed.json'), loadFixture('allure', 'failed.json')];
    const { tool, summary, testResults } = detectAndParse(undefined, files);

    expect(tool).toBe('allure');
    expect(summary.total).toBe(2);
    expect(testResults).toHaveLength(2);
  });

  test('parses a Newman report end to end', () => {
    const file = loadFixture('newman', 'with-failures.json');
    const { tool, summary } = detectAndParse(undefined, [file]);

    expect(tool).toBe('newman');
    expect(summary).toMatchObject({ total: 2, passed: 1, failed: 1 });
  });

  test('fails when an explicit tool does not match the actual file shape', () => {
    const allureFile = loadFixture('allure', 'passed.json');
    expect(() => detectAndParse('newman', [allureFile])).toThrow(/does not look like a Newman/);
  });
});
