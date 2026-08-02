import { describe, test, expect } from 'vitest';
import { findSuiteSnapshotEntry } from '../src/utils/suiteSnapshotLookup';

const suiteSnapshot = [
  { expId: 'EXP-DT-001', scope: 'table', column: null, params: { count: 60 }, threshold: 100 },
  {
    expId: 'EXP-DT-010',
    scope: 'column',
    column: 'DNI',
    params: { type: 'text' },
    threshold: 100,
  },
  {
    expId: 'EXP-DT-010',
    scope: 'column',
    column: 'Nombre',
    params: { type: 'text' },
    threshold: 100,
  },
  {
    expId: 'EXP-DT-020',
    scope: 'multicolumn',
    columns: ['DNI', 'Email'],
    params: { values: ['x'] },
    threshold: 100,
  },
];

describe('findSuiteSnapshotEntry', () => {
  test('scope column: empareja por expId + column exacta (no la primera coincidencia de expId)', () => {
    const result = { expId: 'EXP-DT-010', column: 'Nombre', status: 'passed' };
    expect(findSuiteSnapshotEntry(suiteSnapshot, result)).toEqual(suiteSnapshot[2]);
  });

  test('scope table: empareja sólo por expId (no hay column/columns)', () => {
    const result = { expId: 'EXP-DT-001', status: 'passed', expected: 60, actual: 60 };
    expect(findSuiteSnapshotEntry(suiteSnapshot, result)).toEqual(suiteSnapshot[0]);
  });

  test('scope multicolumn: empareja por el mismo array de columns, en orden', () => {
    const result = { expId: 'EXP-DT-020', columns: ['DNI', 'Email'], status: 'passed' };
    expect(findSuiteSnapshotEntry(suiteSnapshot, result)).toEqual(suiteSnapshot[3]);
  });

  test('sin match, devuelve undefined', () => {
    const result = { expId: 'EXP-DT-099', column: 'X', status: 'passed' };
    expect(findSuiteSnapshotEntry(suiteSnapshot, result)).toBeUndefined();
  });
});
