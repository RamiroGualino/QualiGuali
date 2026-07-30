const testDb = require('../helpers/testDb');
const { nextCode, nextSequence } = require('../../src/services/counter.service');

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

describe('counter.service', () => {
  test('nextCode formats a zero-padded sequential code starting at 001', async () => {
    const codeA = await nextCode('project-1', 'REQ');
    const codeB = await nextCode('project-1', 'REQ');

    expect(codeA).toBe('REQ-001');
    expect(codeB).toBe('REQ-002');
  });

  test('keeps independent counters per project and per prefix', async () => {
    const reqCode = await nextCode('project-1', 'REQ');
    const tcCode = await nextCode('project-1', 'TC');
    const otherProjectCode = await nextCode('project-2', 'REQ');

    expect(reqCode).toBe('REQ-001');
    expect(tcCode).toBe('TC-001');
    expect(otherProjectCode).toBe('REQ-001');
  });

  test('handles a simulated race condition with no duplicates or gaps', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => nextSequence('project-race', 'REQ')),
    );

    const sorted = [...results].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });
});
