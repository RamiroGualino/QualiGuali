import { describe, test, expect } from 'vitest';
import { deriveTotalRecords, resultImpact } from '../src/utils/resultImpact';

describe('deriveTotalRecords', () => {
  test('sin resultados con evaluated, devuelve null', () => {
    expect(deriveTotalRecords([{ status: 'passed' }])).toBeNull();
  });

  test('toma el evaluated del primer resultado que lo tenga', () => {
    expect(
      deriveTotalRecords([{ status: 'passed' }, { evaluated: 60, totalUnexpected: 2 }]),
    ).toBe(60);
  });
});

describe('resultImpact', () => {
  test('scope column/multicolumn: usa totalUnexpected/evaluated tal cual', () => {
    expect(resultImpact({ evaluated: 60, totalUnexpected: 2 }, 60)).toEqual({
      affected: 2,
      total: 60,
    });
  });

  test('scope table aprobado: 0 de totalRecords', () => {
    expect(resultImpact({ status: 'passed', expected: 15, actual: 15 }, 60)).toEqual({
      affected: 0,
      total: 60,
    });
  });

  test('scope table fallido: todo el archivo afectado', () => {
    expect(resultImpact({ status: 'failed', expected: 15, actual: 14 }, 60)).toEqual({
      affected: 60,
      total: 60,
    });
  });

  test('sin totalRecords conocido, devuelve null', () => {
    expect(resultImpact({ status: 'failed', expected: 15, actual: 14 }, null)).toBeNull();
  });
});
