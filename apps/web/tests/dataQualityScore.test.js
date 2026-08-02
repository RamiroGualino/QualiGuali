import { describe, test, expect } from 'vitest';
import { calculateDataQualityScore, dataQualityScoreTone } from '../src/utils/dataQualityScore';

describe('calculateDataQualityScore', () => {
  test('sin resultados devuelve null', () => {
    expect(calculateDataQualityScore([])).toBeNull();
  });

  test('promedia successPercent cuando existe', () => {
    const score = calculateDataQualityScore([
      { status: 'passed', successPercent: 100 },
      { status: 'failed', successPercent: 80 },
    ]);
    expect(score).toBe(90);
  });

  test('una expectativa de Tabla (sin successPercent) cuenta 100 si pasó, 0 si falló', () => {
    const passed = calculateDataQualityScore([{ status: 'passed' }]);
    expect(passed).toBe(100);

    const failed = calculateDataQualityScore([{ status: 'failed' }]);
    expect(failed).toBe(0);
  });

  test('mezcla de nivel Tabla y Columna', () => {
    const score = calculateDataQualityScore([
      { status: 'passed' }, // Tabla, pasó -> 100
      { status: 'failed', successPercent: 50 }, // Columna -> 50
    ]);
    expect(score).toBe(75);
  });

  test('redondea el resultado', () => {
    const score = calculateDataQualityScore([
      { status: 'passed', successPercent: 100 },
      { status: 'passed', successPercent: 100 },
      { status: 'failed', successPercent: 0 },
    ]);
    expect(score).toBe(67); // 200/3 = 66.66... -> 67
  });
});

describe('dataQualityScoreTone', () => {
  test('80-100 es pass', () => {
    expect(dataQualityScoreTone(100)).toBe('pass');
    expect(dataQualityScoreTone(80)).toBe('pass');
  });

  test('40-80 es warning', () => {
    expect(dataQualityScoreTone(79)).toBe('warning');
    expect(dataQualityScoreTone(40)).toBe('warning');
  });

  test('0-40 es fail', () => {
    expect(dataQualityScoreTone(39)).toBe('fail');
    expect(dataQualityScoreTone(0)).toBe('fail');
  });

  test('null es neutral', () => {
    expect(dataQualityScoreTone(null)).toBe('neutral');
  });
});
