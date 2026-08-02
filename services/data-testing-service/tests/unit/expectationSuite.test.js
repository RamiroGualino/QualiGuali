const testDb = require('../helpers/testDb');
const ExpectationSuite = require('../../src/models/ExpectationSuite');

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

function baseSuite(overrides = {}) {
  return {
    projectId: 'proj-1',
    name: 'Suite de Afiliados',
    createdBy: 'user-1',
    ...overrides,
  };
}

describe('ExpectationSuite', () => {
  test('guarda una Suite válida con todos los campos requeridos', async () => {
    const suite = await ExpectationSuite.create(baseSuite());

    expect(suite._id).toBeDefined();
    expect(suite.projectId).toBe('proj-1');
    expect(suite.name).toBe('Suite de Afiliados');
    expect(suite.createdBy).toBe('user-1');
    expect(suite.createdAt).toBeInstanceOf(Date);
  });

  test('falla si falta projectId', async () => {
    await expect(
      ExpectationSuite.create(baseSuite({ projectId: undefined })),
    ).rejects.toThrow();
  });

  test('falla si falta name', async () => {
    await expect(ExpectationSuite.create(baseSuite({ name: undefined }))).rejects.toThrow();
  });

  test('el default de sampleLimit es 20 si no se especifica', async () => {
    const suite = await ExpectationSuite.create(baseSuite());
    expect(suite.sampleLimit).toBe(20);
  });

  test('el default de version es 1 al crear', async () => {
    const suite = await ExpectationSuite.create(baseSuite());
    expect(suite.version).toBe(1);
  });

  test('el default de threshold de una expectativa es 100 si no se especifica', async () => {
    const suite = await ExpectationSuite.create(
      baseSuite({
        expectedColumns: [{ name: 'dni' }],
        expectations: [{ expId: 'EXP-DT-007', scope: 'column', column: 'dni' }],
      }),
    );

    expect(suite.expectations[0].threshold).toBe(100);
  });

  test('tipoDato de una columna esperada default a sin_definir si no se especifica (etapa 6.2)', async () => {
    const suite = await ExpectationSuite.create(baseSuite({ expectedColumns: [{ name: 'dni' }] }));
    expect(suite.expectedColumns[0].tipoDato).toBe('sin_definir');
  });

  test('rechaza un tipoDato fuera del enum', async () => {
    await expect(
      ExpectationSuite.create(
        baseSuite({ expectedColumns: [{ name: 'dni', tipoDato: 'entero' }] }),
      ),
    ).rejects.toThrow();
  });

  test('rechaza un expId fuera del catálogo', async () => {
    await expect(
      ExpectationSuite.create(
        baseSuite({
          expectations: [{ expId: 'EXP-DT-999', scope: 'column', column: 'dni' }],
        }),
      ),
    ).rejects.toThrow();
  });

  test('rechaza un scope fuera del enum', async () => {
    await expect(
      ExpectationSuite.create(
        baseSuite({
          expectations: [{ expId: 'EXP-DT-007', scope: 'row', column: 'dni' }],
        }),
      ),
    ).rejects.toThrow();
  });

  test('guarda correctamente una expectativa de cada scope con su params correspondiente', async () => {
    const suite = await ExpectationSuite.create(
      baseSuite({
        expectedColumns: [{ name: 'dni' }, { name: 'nombre' }, { name: 'fecha_nacimiento', tipoDato: 'fecha' }],
        businessIdColumn: 'dni',
        expectations: [
          // Nivel Tabla (etapa-0 §6.1) — sin threshold relevante.
          { expId: 'EXP-DT-001', scope: 'table', params: { count: 100 } },
          // Nivel Columna (etapa-0 §6.2) — "entre X e Y".
          {
            expId: 'EXP-DT-012',
            scope: 'column',
            column: 'edad',
            params: { min: 0, max: 120 },
            threshold: 95,
          },
          // Nivel Multicolumna (etapa-0 §6.3) — "Columna A > Columna B".
          {
            expId: 'EXP-DT-032',
            scope: 'multicolumn',
            columns: ['fecha_alta', 'fecha_baja'],
            params: { orEqual: false },
          },
        ],
      }),
    );

    expect(suite.expectations).toHaveLength(3);
    const [table, column, multicolumn] = suite.expectations;

    expect(table.scope).toBe('table');
    expect(table.params.count).toBe(100);

    expect(column.scope).toBe('column');
    expect(column.column).toBe('edad');
    expect(column.params.min).toBe(0);
    expect(column.params.max).toBe(120);
    expect(column.threshold).toBe(95);

    expect(multicolumn.scope).toBe('multicolumn');
    expect(multicolumn.columns).toEqual(['fecha_alta', 'fecha_baja']);
    expect(multicolumn.params.orEqual).toBe(false);
  });
});
