const table = require('../../src/engine/tableExpectations');

const records = [{ _rowId: 1 }, { _rowId: 2 }, { _rowId: 3 }];
const headers = ['nombre', 'edad', 'email'];

describe('EXP-DT-001 rowCountEquals', () => {
  test('pasa cuando la cantidad de filas coincide', () => {
    const result = table.rowCountEquals(records, headers, { count: 3 });
    expect(result).toEqual({ status: 'passed', expected: 3, actual: 3 });
  });

  test('falla cuando no coincide', () => {
    const result = table.rowCountEquals(records, headers, { count: 5 });
    expect(result.status).toBe('failed');
  });
});

describe('EXP-DT-002 rowCountBetween', () => {
  test('pasa cuando está dentro del rango', () => {
    expect(table.rowCountBetween(records, headers, { min: 1, max: 5 }).status).toBe('passed');
  });

  test('falla cuando está fuera del rango', () => {
    expect(table.rowCountBetween(records, headers, { min: 10, max: 20 }).status).toBe('failed');
  });
});

describe('EXP-DT-003 columnCountEquals', () => {
  test('pasa cuando la cantidad de columnas coincide', () => {
    expect(table.columnCountEquals(records, headers, { count: 3 }).status).toBe('passed');
  });

  test('falla cuando no coincide', () => {
    expect(table.columnCountEquals(records, headers, { count: 10 }).status).toBe('failed');
  });
});

describe('EXP-DT-004 columnCountBetween', () => {
  test('pasa cuando está dentro del rango', () => {
    expect(table.columnCountBetween(records, headers, { min: 2, max: 4 }).status).toBe('passed');
  });

  test('falla cuando está fuera del rango', () => {
    expect(table.columnCountBetween(records, headers, { min: 10, max: 20 }).status).toBe('failed');
  });
});

describe('EXP-DT-005 columnsMatchOrderedList', () => {
  test('pasa cuando las columnas coinciden en el mismo orden', () => {
    const result = table.columnsMatchOrderedList(records, headers, {
      columns: ['nombre', 'edad', 'email'],
    });
    expect(result.status).toBe('passed');
  });

  test('falla cuando el orden no coincide', () => {
    const result = table.columnsMatchOrderedList(records, headers, {
      columns: ['edad', 'nombre', 'email'],
    });
    expect(result.status).toBe('failed');
  });
});

describe('EXP-DT-006 columnsMatchSet', () => {
  test('pasa cuando es el mismo conjunto, sin importar el orden', () => {
    const result = table.columnsMatchSet(records, headers, {
      columns: ['email', 'edad', 'nombre'],
    });
    expect(result.status).toBe('passed');
  });

  test('falla cuando falta o sobra una columna', () => {
    const result = table.columnsMatchSet(records, headers, { columns: ['nombre', 'edad'] });
    expect(result.status).toBe('failed');
  });
});
