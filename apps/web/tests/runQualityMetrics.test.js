import { describe, test, expect } from 'vitest';
import {
  rulesPassFailCounts,
  qualityByColumn,
  errorDistributionByColumn,
} from '../src/utils/runQualityMetrics';

describe('rulesPassFailCounts', () => {
  test('cuenta aprobadas y falladas', () => {
    expect(
      rulesPassFailCounts([
        { status: 'passed' },
        { status: 'passed' },
        { status: 'failed' },
      ]),
    ).toEqual({ passed: 2, failed: 1 });
  });
});

describe('qualityByColumn', () => {
  test('ignora resultados de Tabla y Multicolumna, promedia por columna en orden de aparición', () => {
    const results = [
      { status: 'passed', expected: 1, actual: 1 }, // Tabla, se ignora
      { column: 'Nombre', status: 'passed', successPercent: 100 },
      { column: 'DNI', status: 'failed', successPercent: 96.67 },
      { column: 'DNI', status: 'failed', successPercent: 3.33 },
      { columns: ['DNI', 'Nombre'], status: 'passed' }, // Multicolumna, se ignora
    ];

    expect(qualityByColumn(results)).toEqual([
      { column: 'Nombre', percent: 100 },
      { column: 'DNI', percent: 50 },
    ]);
  });
});

describe('errorDistributionByColumn', () => {
  test('cuenta reglas falladas por columna, ordenado de mayor a menor', () => {
    const results = [
      { column: 'DNI', status: 'failed' },
      { column: 'DNI', status: 'failed' },
      { column: 'Telefono', status: 'failed' },
      { column: 'Nombre', status: 'passed' },
      { status: 'failed', expected: 1, actual: 2 }, // Tabla, se ignora
    ];

    expect(errorDistributionByColumn(results)).toEqual([
      { column: 'DNI', count: 2 },
      { column: 'Telefono', count: 1 },
    ]);
  });
});
