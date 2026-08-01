const {
  DEFAULT_INLINE_THRESHOLD_BYTES,
  shouldStoreInline,
  truncateLogs,
} = require('../../src/services/resultStorage.service');

describe('shouldStoreInline', () => {
  test('treats null and undefined as always-inline', () => {
    expect(shouldStoreInline(null)).toBe(true);
    expect(shouldStoreInline(undefined)).toBe(true);
  });

  test('keeps a small string inline', () => {
    expect(shouldStoreInline('a short body')).toBe(true);
  });

  test('keeps a small object inline', () => {
    expect(shouldStoreInline({ 'content-type': 'application/json' })).toBe(true);
  });

  test('pushes a value over the default threshold out of Mongo', () => {
    const big = 'x'.repeat(DEFAULT_INLINE_THRESHOLD_BYTES + 1);
    expect(shouldStoreInline(big)).toBe(false);
  });

  test('is inclusive at exactly the threshold boundary', () => {
    const exact = 'x'.repeat(DEFAULT_INLINE_THRESHOLD_BYTES);
    expect(shouldStoreInline(exact)).toBe(true);
    const overByOne = 'x'.repeat(DEFAULT_INLINE_THRESHOLD_BYTES + 1);
    expect(shouldStoreInline(overByOne)).toBe(false);
  });

  test('counts bytes, not characters, for multi-byte UTF-8 text', () => {
    // Each '€' is 3 bytes in UTF-8 but 1 JS string character.
    const chars = Math.floor(DEFAULT_INLINE_THRESHOLD_BYTES / 3) + 10;
    const multiByte = '€'.repeat(chars);
    expect(multiByte.length).toBeLessThanOrEqual(DEFAULT_INLINE_THRESHOLD_BYTES);
    expect(shouldStoreInline(multiByte)).toBe(false);
  });

  test('respects a custom threshold', () => {
    expect(shouldStoreInline('12345', 4)).toBe(false);
    expect(shouldStoreInline('1234', 4)).toBe(true);
  });
});

describe('truncateLogs', () => {
  test('returns an empty array for non-array input', () => {
    expect(truncateLogs(null)).toEqual([]);
    expect(truncateLogs(undefined)).toEqual([]);
    expect(truncateLogs('not an array')).toEqual([]);
  });

  test('passes short logs through unchanged', () => {
    expect(truncateLogs(['a', 'b'])).toEqual(['a', 'b']);
  });

  test('caps the number of log lines kept', () => {
    const logs = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    const result = truncateLogs(logs, { maxCount: 50 });
    expect(result).toHaveLength(50);
    expect(result[0]).toBe('line 0');
    expect(result[49]).toBe('line 49');
  });

  test('caps the length of an individual log line', () => {
    const long = 'y'.repeat(2010);
    const [result] = truncateLogs([long], { maxLength: 2000 });
    expect(result).toHaveLength(2001); // 2000 chars + the ellipsis marker
    expect(result.endsWith('…')).toBe(true);
  });

  test('stringifies a non-string log entry', () => {
    const [result] = truncateLogs([{ level: 'info', message: 'hi' }]);
    expect(result).toBe(JSON.stringify({ level: 'info', message: 'hi' }));
  });
});
