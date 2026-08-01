const { shouldNotify } = require('../../src/services/notifications.service');

describe('shouldNotify', () => {
  test('returns true when the summary has at least one failed test', () => {
    expect(shouldNotify({ total: 3, passed: 2, failed: 1, broken: 0, skipped: 0 })).toBe(true);
  });

  test('returns false when nothing failed', () => {
    expect(shouldNotify({ total: 3, passed: 3, failed: 0, broken: 0, skipped: 0 })).toBe(false);
  });

  test('is not tripped by broken/skipped alone', () => {
    expect(shouldNotify({ total: 3, passed: 1, failed: 0, broken: 1, skipped: 1 })).toBe(false);
  });

  test('returns false for a missing/undefined summary instead of throwing', () => {
    expect(shouldNotify(null)).toBe(false);
    expect(shouldNotify(undefined)).toBe(false);
  });
});
