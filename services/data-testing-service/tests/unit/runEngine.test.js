const { run } = require('../../src/engine/runEngine');

const records = [
  { _rowId: 1, dni: '30111111', edad: 25 },
  { _rowId: 2, dni: '30222222', edad: 40 },
];
const headers = ['dni', 'edad'];
const columnMapping = [
  { expectedColumn: 'dni', matchedColumn: 'dni', matchType: 'exact' },
  { expectedColumn: 'edad', matchedColumn: 'edad', matchType: 'exact' },
  { expectedColumn: 'telefono', matchedColumn: null, matchType: 'not_found' },
];

describe('runEngine.run', () => {
  test('columna esperada no mapeada: sus expectativas no aparecen en results[], sí aparece found:false en columnCoverage (BR-DT-003)', () => {
    const suiteSnapshot = [
      { expId: 'EXP-DT-007', scope: 'column', column: 'edad', params: {}, threshold: 100 },
      { expId: 'EXP-DT-007', scope: 'column', column: 'telefono', params: {}, threshold: 100 },
    ];

    const result = run({ records, headers, suiteSnapshot, columnMapping, sampleLimit: 20, businessIdColumn: null });

    expect(result.columnCoverage).toContainEqual({ expectedColumn: 'telefono', found: false });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].column).toBe('edad');
  });

  test('multicolumna: si alguna de sus columnas no está mapeada, tampoco se evalúa (BR-DT-003 extendida)', () => {
    const suiteSnapshot = [
      {
        expId: 'EXP-DT-033',
        scope: 'multicolumn',
        columns: ['edad', 'telefono'],
        params: {},
        threshold: 100,
      },
    ];

    const result = run({ records, headers, suiteSnapshot, columnMapping, sampleLimit: 20, businessIdColumn: null });

    expect(result.results).toHaveLength(0);
  });

  test('corrida con todas las expectativas pasando: overallStatus "passed"', () => {
    const suiteSnapshot = [
      { expId: 'EXP-DT-001', scope: 'table', params: { count: 2 } },
      { expId: 'EXP-DT-007', scope: 'column', column: 'dni', params: {}, threshold: 100 },
    ];

    const result = run({ records, headers, suiteSnapshot, columnMapping, sampleLimit: 20, businessIdColumn: null });

    expect(result.overallStatus).toBe('passed');
  });

  test('corrida con al menos una expectativa fallando: overallStatus "failed"', () => {
    const suiteSnapshot = [
      { expId: 'EXP-DT-001', scope: 'table', params: { count: 2 } },
      { expId: 'EXP-DT-012', scope: 'column', column: 'edad', params: { min: 0, max: 30 }, threshold: 100 },
    ];

    const result = run({ records, headers, suiteSnapshot, columnMapping, sampleLimit: 20, businessIdColumn: null });

    expect(result.overallStatus).toBe('failed');
  });

  test('el threshold configurado en la expectativa queda en el resultado (no el default null del schema)', () => {
    const suiteSnapshot = [
      { expId: 'EXP-DT-007', scope: 'column', column: 'edad', params: {}, threshold: 70 },
    ];

    const result = run({ records, headers, suiteSnapshot, columnMapping, sampleLimit: 20, businessIdColumn: null });

    expect(result.results[0].threshold).toBe(70);
  });

  test('resuelve businessIdColumn a través del mapeo de columnas, no del nombre esperado crudo', () => {
    const suiteSnapshot = [
      { expId: 'EXP-DT-012', scope: 'column', column: 'edad', params: { min: 0, max: 30 }, threshold: 100 },
    ];

    const result = run({
      records,
      headers,
      suiteSnapshot,
      columnMapping,
      sampleLimit: 20,
      businessIdColumn: 'dni',
    });

    expect(result.results[0].affectedRecords[0]).toMatchObject({ rowId: 2, businessId: '30222222' });
  });

  test('un expId de nivel Tabla no tiene column/successPercent, tiene expected/actual', () => {
    const suiteSnapshot = [{ expId: 'EXP-DT-001', scope: 'table', params: { count: 99 } }];

    const result = run({ records, headers, suiteSnapshot, columnMapping, sampleLimit: 20, businessIdColumn: null });

    expect(result.results[0]).toMatchObject({ expId: 'EXP-DT-001', status: 'failed', expected: 99, actual: 2 });
    expect(result.results[0].successPercent).toBeUndefined();
  });
});
