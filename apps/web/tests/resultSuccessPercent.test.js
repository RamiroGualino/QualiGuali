import { describe, test, expect } from 'vitest';
import { resultSuccessPercent } from '../src/utils/resultSuccessPercent';

describe('resultSuccessPercent', () => {
  test('usa successPercent cuando existe (aunque sea 0)', () => {
    expect(resultSuccessPercent({ status: 'failed', successPercent: 0 })).toBe(0);
    expect(resultSuccessPercent({ status: 'passed', successPercent: 96.67 })).toBe(96.67);
  });

  test('scope Tabla (sin successPercent): 100 si pasó, 0 si falló', () => {
    expect(resultSuccessPercent({ status: 'passed' })).toBe(100);
    expect(resultSuccessPercent({ status: 'failed' })).toBe(0);
  });
});
