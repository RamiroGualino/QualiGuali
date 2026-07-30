const {
  isValidResultStatus,
  applyExecutionResult,
} = require('../../src/services/executionResult.service');

describe('isValidResultStatus', () => {
  test.each(['pass', 'fail', 'blocked'])('accepts "%s"', (status) => {
    expect(isValidResultStatus(status)).toBe(true);
  });

  test.each(['not_executed', 'bogus', undefined, null])('rejects "%s"', (status) => {
    expect(isValidResultStatus(status)).toBe(false);
  });
});

describe('applyExecutionResult', () => {
  test('builds an update with status, comments, executedBy and executedAt', () => {
    const before = Date.now();
    const update = applyExecutionResult({ status: 'pass', comments: 'Works', executedBy: 'u1' });
    const after = Date.now();

    expect(update.status).toBe('pass');
    expect(update.comments).toBe('Works');
    expect(update.executedBy).toBe('u1');
    expect(update.executedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(update.executedAt.getTime()).toBeLessThanOrEqual(after);
  });

  test('defaults comments to an empty string when omitted', () => {
    const update = applyExecutionResult({ status: 'fail', executedBy: 'u1' });
    expect(update.comments).toBe('');
  });

  test('throws a 400-flagged error for an invalid status', () => {
    expect(() => applyExecutionResult({ status: 'not_executed', executedBy: 'u1' })).toThrow(
      /Invalid execution status/,
    );

    try {
      applyExecutionResult({ status: 'bogus', executedBy: 'u1' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test('allows re-executing regardless of a hypothetical previous status', () => {
    // applyExecutionResult only looks at the target status — an Execution
    // can move pass -> fail -> pass freely.
    expect(() => applyExecutionResult({ status: 'pass', executedBy: 'u1' })).not.toThrow();
    expect(() => applyExecutionResult({ status: 'fail', executedBy: 'u1' })).not.toThrow();
    expect(() => applyExecutionResult({ status: 'blocked', executedBy: 'u1' })).not.toThrow();
  });
});
