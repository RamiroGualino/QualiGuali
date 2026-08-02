import { describe, test, expect, beforeAll } from 'vitest';
import i18n from '../src/i18n';
import { formatExpectationText } from '../src/utils/expectationText';

beforeAll(() => i18n.changeLanguage('en'));

const t = i18n.t.bind(i18n);

describe('formatExpectationText', () => {
  test('expectativas sin params devuelven el label del catálogo tal cual', () => {
    expect(formatExpectationText({ expId: 'EXP-DT-007', params: {} }, t)).toBe('Not null');
    expect(formatExpectationText({ expId: 'EXP-DT-021', params: {} }, t)).toBe(
      'Parseable as date',
    );
  });

  test('EXP-DT-001 interpola el valor real', () => {
    expect(formatExpectationText({ expId: 'EXP-DT-001', params: { count: 4 } }, t)).toBe(
      'Row count = 4',
    );
  });

  test('EXP-DT-001 sin params.count muestra el placeholder', () => {
    expect(formatExpectationText({ expId: 'EXP-DT-001', params: {} }, t)).toBe('Row count = ___');
  });

  test('EXP-DT-012 (min/max) interpola ambos valores', () => {
    expect(
      formatExpectationText({ expId: 'EXP-DT-012', params: { min: 18, max: 65 } }, t),
    ).toBe('Between 18 and 65');
  });

  test('EXP-DT-012 con sólo min completo muestra placeholder en max', () => {
    expect(formatExpectationText({ expId: 'EXP-DT-012', params: { min: 18 } }, t)).toBe(
      'Between 18 and ___',
    );
  });

  test('EXP-DT-005 (lista de columnas) 5 o menos se listan todas', () => {
    expect(
      formatExpectationText(
        { expId: 'EXP-DT-005', params: { columns: ['dni', 'nombre', 'email'] } },
        t,
      ),
    ).toBe('Columns in this order: dni, nombre, email');
  });

  test('EXP-DT-013 (más de 5 valores) trunca a 5 + "and N more"', () => {
    expect(
      formatExpectationText(
        { expId: 'EXP-DT-013', params: { values: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } },
        t,
      ),
    ).toBe('In the set: a, b, c, d, e, and 2 more');
  });

  test('EXP-DT-010 (tipo de dato) usa el label traducido, no el valor interno', () => {
    expect(formatExpectationText({ expId: 'EXP-DT-010', params: { type: 'number' } }, t)).toBe(
      'Data type: Number',
    );
  });

  test('EXP-DT-032 agrega el sufijo "(or equal)" sólo si orEqual está tildado', () => {
    expect(
      formatExpectationText(
        { expId: 'EXP-DT-032', columns: ['a', 'b'], params: { orEqual: false } },
        t,
      ),
    ).toBe('a > b');
    expect(
      formatExpectationText(
        { expId: 'EXP-DT-032', columns: ['a', 'b'], params: { orEqual: true } },
        t,
      ),
    ).toBe('a > b (or equal)');
  });

  test('EXP-DT-034 (multicolumna) usa `columns`, no `params.columns`', () => {
    expect(
      formatExpectationText({ expId: 'EXP-DT-034', columns: ['nombre', 'email'], params: {} }, t),
    ).toBe('Unique combination: nombre, email');
  });

  test('EXP-DT-035 usa "+" para unir las columnas, no coma', () => {
    expect(
      formatExpectationText(
        { expId: 'EXP-DT-035', columns: ['a', 'b'], params: { target: 100 } },
        t,
      ),
    ).toBe('a + b = 100');
  });

  test('sin ninguna columna/valor todavía, EXP-DT-035 muestra placeholders en ambos lados', () => {
    expect(formatExpectationText({ expId: 'EXP-DT-035', columns: [], params: {} }, t)).toBe(
      '___ = ___',
    );
  });
});
