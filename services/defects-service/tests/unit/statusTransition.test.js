const {
  canTransition,
  assertValidTransition,
} = require('../../src/services/statusTransition.service');

describe('canTransition', () => {
  test.each([
    ['open', 'in_progress'],
    ['in_progress', 'resolved'],
    ['resolved', 'closed'],
    ['resolved', 'reopened'],
    ['closed', 'reopened'],
    ['reopened', 'in_progress'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  test.each([
    ['open', 'resolved'],
    ['open', 'closed'],
    ['open', 'reopened'],
    ['in_progress', 'closed'],
    ['in_progress', 'open'],
    ['in_progress', 'reopened'],
    ['resolved', 'open'],
    ['resolved', 'in_progress'],
    ['closed', 'open'],
    ['closed', 'in_progress'],
    ['closed', 'resolved'],
    ['reopened', 'resolved'],
    ['reopened', 'closed'],
    ['reopened', 'open'],
    ['open', 'open'],
    ['closed', 'closed'],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  test('rejects an unknown status', () => {
    expect(canTransition('bogus', 'open')).toBe(false);
    expect(canTransition('open', 'bogus')).toBe(false);
  });
});

describe('assertValidTransition', () => {
  test('does not throw for a valid transition', () => {
    expect(() => assertValidTransition('open', 'in_progress')).not.toThrow();
  });

  test('throws a 400-flagged error for an invalid transition', () => {
    try {
      assertValidTransition('open', 'closed');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/Cannot transition defect from "open" to "closed"/);
    }
  });
});
