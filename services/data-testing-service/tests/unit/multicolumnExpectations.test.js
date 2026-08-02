const multicolumn = require('../../src/engine/multicolumnExpectations');

const defaultOpts = { threshold: 100, sampleLimit: 20, businessIdColumn: null };

describe('EXP-DT-032 columnPairGreaterThan', () => {
  // Ejemplo de etapa-3: dataset con filas donde A <= B cuentan como no
  // conformes, con rowId correcto en affectedRecords.
  test('filas donde A <= B cuentan como no conformes, con rowId correcto', () => {
    const records = [
      { _rowId: 1, fecha_baja: 20, fecha_alta: 10 }, // 20 > 10: ok
      { _rowId: 2, fecha_baja: 5, fecha_alta: 10 }, // 5 <= 10: no conforme
      { _rowId: 3, fecha_baja: 10, fecha_alta: 10 }, // igual: no conforme (orEqual: false)
    ];
    const result = multicolumn.columnPairGreaterThan(
      records,
      ['fecha_baja', 'fecha_alta'],
      { orEqual: false },
      defaultOpts,
    );

    expect(result.status).toBe('failed');
    expect(result.affectedRecords.map((r) => r.rowId)).toEqual([2, 3]);
  });

  test('con orEqual: true, A === B pasa', () => {
    const records = [{ _rowId: 1, a: 10, b: 10 }];
    const result = multicolumn.columnPairGreaterThan(records, ['a', 'b'], { orEqual: true }, defaultOpts);
    expect(result.status).toBe('passed');
  });

  test('valores no numéricos en cualquiera de las dos columnas cuentan como no conformes', () => {
    const records = [{ _rowId: 1, a: 'no-numero', b: 10 }];
    const result = multicolumn.columnPairGreaterThan(records, ['a', 'b'], { orEqual: false }, defaultOpts);
    expect(result.status).toBe('failed');
  });
});

describe('EXP-DT-033 columnPairEqual', () => {
  test('pasa cuando ambas columnas coinciden en todas las filas', () => {
    const records = [
      { _rowId: 1, a: 'x', b: 'x' },
      { _rowId: 2, a: 10, b: '10' }, // .xlsx (número) vs .csv (string) del mismo dato lógico
    ];
    expect(multicolumn.columnPairEqual(records, ['a', 'b'], {}, defaultOpts).status).toBe('passed');
  });

  test('falla cuando alguna fila difiere', () => {
    const records = [{ _rowId: 1, a: 'x', b: 'y' }];
    expect(multicolumn.columnPairEqual(records, ['a', 'b'], {}, defaultOpts).status).toBe('failed');
  });
});

describe('EXP-DT-034 combinationUniqueWithinRecord', () => {
  test('pasa cuando la combinación de columnas es única en cada fila', () => {
    const records = [
      { _rowId: 1, proyecto: 'A', modulo: 'login' },
      { _rowId: 2, proyecto: 'A', modulo: 'checkout' },
      { _rowId: 3, proyecto: 'B', modulo: 'login' },
    ];
    const result = multicolumn.combinationUniqueWithinRecord(records, ['proyecto', 'modulo'], {}, defaultOpts);
    expect(result.status).toBe('passed');
  });

  test('falla y marca ambas filas cuando la combinación se repite', () => {
    const records = [
      { _rowId: 1, proyecto: 'A', modulo: 'login' },
      { _rowId: 2, proyecto: 'A', modulo: 'login' },
    ];
    const result = multicolumn.combinationUniqueWithinRecord(records, ['proyecto', 'modulo'], {}, defaultOpts);
    expect(result.status).toBe('failed');
    expect(result.affectedRecords.map((r) => r.rowId)).toEqual([1, 2]);
  });
});

describe('EXP-DT-035 multicolumnSumEquals', () => {
  test('pasa cuando la suma de las columnas de cada fila da el valor objetivo', () => {
    const records = [{ _rowId: 1, parcial1: 40, parcial2: 60 }];
    const result = multicolumn.multicolumnSumEquals(
      records,
      ['parcial1', 'parcial2'],
      { target: 100 },
      defaultOpts,
    );
    expect(result.status).toBe('passed');
  });

  test('falla cuando la suma de alguna fila no da el valor objetivo', () => {
    const records = [{ _rowId: 1, parcial1: 40, parcial2: 50 }];
    const result = multicolumn.multicolumnSumEquals(
      records,
      ['parcial1', 'parcial2'],
      { target: 100 },
      defaultOpts,
    );
    expect(result.status).toBe('failed');
  });
});
