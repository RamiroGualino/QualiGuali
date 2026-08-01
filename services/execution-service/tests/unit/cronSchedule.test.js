const { isValidCronExpression, getNextRunAt } = require('../../src/services/cronSchedule.service');

describe('isValidCronExpression', () => {
  test('accepts standard 5-field expressions', () => {
    expect(isValidCronExpression('* * * * *')).toBe(true);
    expect(isValidCronExpression('0 9 * * *')).toBe(true);
    expect(isValidCronExpression('*/15 8-17 * * 1-5')).toBe(true);
  });

  test('rejects malformed expressions', () => {
    expect(isValidCronExpression('not a cron expression')).toBe(false);
    expect(isValidCronExpression('99 * * * *')).toBe(false);
    expect(isValidCronExpression('')).toBe(false);
  });
});

describe('getNextRunAt', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('returns null for an invalid expression instead of throwing', async () => {
    await expect(getNextRunAt('not a cron expression', 'UTC')).resolves.toBeNull();
  });

  test('computes the next run relative to the current time, in UTC', async () => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const nextRun = await getNextRunAt('0 9 * * *', 'UTC');

    expect(nextRun).toBeInstanceOf(Date);
    expect(nextRun.toISOString()).toBe('2026-01-01T09:00:00.000Z');
  });

  test('accounts for a non-UTC timezone', async () => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    // 9am in UTC-3 (Argentina, no DST) is noon UTC the same day.
    const nextRun = await getNextRunAt('0 9 * * *', 'America/Argentina/Buenos_Aires');

    expect(nextRun.toISOString()).toBe('2026-01-01T12:00:00.000Z');
  });

  test("advances to the next day once today's trigger time has already passed", async () => {
    jest.useFakeTimers({ advanceTimers: false });
    jest.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    const nextRun = await getNextRunAt('0 9 * * *', 'UTC');

    expect(nextRun.toISOString()).toBe('2026-01-02T09:00:00.000Z');
  });
});
