const mongoose = require('mongoose');
const testDb = require('../helpers/testDb');
const ValidationRun = require('../../src/models/ValidationRun');

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

function baseRun(overrides = {}) {
  return {
    suiteId: new mongoose.Types.ObjectId(),
    suiteSnapshotVersion: 1,
    suiteSnapshot: [{ expId: 'EXP-DT-007', scope: 'column', column: 'dni' }],
    projectId: 'proj-1',
    datasetName: 'afiliados-julio.xlsx',
    executedBy: 'user-1',
    overallStatus: 'passed',
    ...overrides,
  };
}

describe('ValidationRun', () => {
  test('guarda una Corrida válida con results y columnCoverage poblados', async () => {
    const run = await ValidationRun.create(
      baseRun({
        columnCoverage: [
          { expectedColumn: 'dni', found: true },
          { expectedColumn: 'telefono', found: false },
        ],
        columnMapping: [{ expectedColumn: 'dni', matchedColumn: 'DNI', matchType: 'exact' }],
        results: [
          {
            expId: 'EXP-DT-007',
            column: 'dni',
            status: 'passed',
            threshold: 100,
            successPercent: 100,
            evaluated: 10,
            matched: 10,
            unexpectedSample: [],
            sampleLimit: 20,
            totalUnexpected: 0,
            affectedRecords: [],
          },
        ],
      }),
    );

    expect(run._id).toBeDefined();
    expect(run.columnCoverage).toHaveLength(2);
    expect(run.columnCoverage[1]).toMatchObject({ expectedColumn: 'telefono', found: false });
    expect(run.results).toHaveLength(1);
    expect(run.results[0].status).toBe('passed');
    expect(run.executedAt).toBeInstanceOf(Date);
  });

  test('falla si falta suiteId', async () => {
    await expect(ValidationRun.create(baseRun({ suiteId: undefined }))).rejects.toThrow();
  });

  test('falla si falta suiteSnapshotVersion', async () => {
    await expect(
      ValidationRun.create(baseRun({ suiteSnapshotVersion: undefined })),
    ).rejects.toThrow();
  });

  test('falla si falta overallStatus', async () => {
    await expect(ValidationRun.create(baseRun({ overallStatus: undefined }))).rejects.toThrow();
  });

  test('rechaza overallStatus fuera de passed/failed', async () => {
    await expect(
      ValidationRun.create(baseRun({ overallStatus: 'warning' })),
    ).rejects.toThrow();
  });

  test('guarda correctamente un affectedRecords con rowId sin businessId', async () => {
    const run = await ValidationRun.create(
      baseRun({
        overallStatus: 'failed',
        results: [
          {
            expId: 'EXP-DT-007',
            column: 'dni',
            status: 'failed',
            affectedRecords: [{ rowId: 42 }],
          },
        ],
      }),
    );

    expect(run.results[0].affectedRecords[0].rowId).toBe(42);
    expect(run.results[0].affectedRecords[0].businessId).toBeNull();
  });

  test('guarda correctamente un affectedRecords con businessId presente', async () => {
    const run = await ValidationRun.create(
      baseRun({
        overallStatus: 'failed',
        results: [
          {
            expId: 'EXP-DT-007',
            column: 'dni',
            status: 'failed',
            affectedRecords: [{ rowId: 405, businessId: '30123456' }],
          },
        ],
      }),
    );

    expect(run.results[0].affectedRecords[0]).toMatchObject({
      rowId: 405,
      businessId: '30123456',
    });
  });

  test('guarda un resultado de nivel Tabla con expected/actual (sin successPercent)', async () => {
    const run = await ValidationRun.create(
      baseRun({
        overallStatus: 'failed',
        results: [
          { expId: 'EXP-DT-001', status: 'failed', expected: 100, actual: 97 },
        ],
      }),
    );

    expect(run.results[0]).toMatchObject({ expected: 100, actual: 97, column: null });
  });

  test('guarda un resultado de nivel Multicolumna con columns[] en vez de column', async () => {
    const run = await ValidationRun.create(
      baseRun({
        results: [
          {
            expId: 'EXP-DT-033',
            columns: ['fecha_alta', 'fecha_baja'],
            status: 'passed',
          },
        ],
      }),
    );

    expect(run.results[0].columns).toEqual(['fecha_alta', 'fecha_baja']);
  });
});
