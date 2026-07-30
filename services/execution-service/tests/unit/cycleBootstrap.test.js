const { buildExecutionDocs } = require('../../src/services/cycleBootstrap.service');

describe('buildExecutionDocs', () => {
  test('builds one not_executed Execution doc per testCaseId', () => {
    const docs = buildExecutionDocs('cycle-1', ['tc-1', 'tc-2', 'tc-3']);

    expect(docs).toEqual([
      { cycleId: 'cycle-1', testCaseId: 'tc-1', status: 'not_executed' },
      { cycleId: 'cycle-1', testCaseId: 'tc-2', status: 'not_executed' },
      { cycleId: 'cycle-1', testCaseId: 'tc-3', status: 'not_executed' },
    ]);
  });

  test('returns an empty array when the plan has no test cases', () => {
    expect(buildExecutionDocs('cycle-1', [])).toEqual([]);
    expect(buildExecutionDocs('cycle-1')).toEqual([]);
  });

  test('dedupes repeated testCaseIds defensively', () => {
    const docs = buildExecutionDocs('cycle-1', ['tc-1', 'tc-1', 'tc-2']);
    expect(docs.map((d) => d.testCaseId)).toEqual(['tc-1', 'tc-2']);
  });

  test('stringifies non-string testCaseIds (e.g. ObjectId-like values)', () => {
    const objectIdLike = { toString: () => '64b6f7e2f1a2b3c4d5e6f7a8' };
    const docs = buildExecutionDocs('cycle-1', [objectIdLike]);
    expect(docs[0].testCaseId).toBe('64b6f7e2f1a2b3c4d5e6f7a8');
  });
});
