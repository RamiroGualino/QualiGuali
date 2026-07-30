const testDb = require('../helpers/testDb');
const { nextCode } = require('../../src/services/counter.service');

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

describe('counter.service (defects-service)', () => {
  test('nextCode formats a zero-padded DEF-NNN code starting at 001', async () => {
    expect(await nextCode('project-1')).toBe('DEF-001');
    expect(await nextCode('project-1')).toBe('DEF-002');
  });

  test('keeps independent counters per project', async () => {
    expect(await nextCode('project-1')).toBe('DEF-001');
    expect(await nextCode('project-2')).toBe('DEF-001');
  });

  test('handles a simulated race condition with no duplicates or gaps', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => nextCode('project-race')));
    const sorted = [...results].sort();
    const expected = Array.from({ length: 25 }, (_, i) => `DEF-${String(i + 1).padStart(3, '0')}`);
    expect(sorted).toEqual(expected);
  });
});
