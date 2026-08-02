import { describe, test, expect, vi } from 'vitest';
import { buildValidationRunPdf, groupResultsByColumn } from '../src/utils/dataTestReportPdf';

const LABELS = {
  reportTitle: 'Validation Run',
  overallPassedLabel: 'Passed',
  overallFailedLabel: 'Failed',
  datasetLabel: 'File',
  executedAtLabel: 'Date',
  columnCoverageTitle: 'Column Coverage',
  expectedColumnHeader: 'Expected column',
  foundHeader: 'Found',
  foundYes: 'Yes',
  foundNo: 'No',
  resultsTitle: 'Expectation Results',
  noResults: 'No runs yet',
  tableLevelGroup: 'Table level',
  statusPassed: 'Passed',
  statusFailed: 'Failed',
  successPercentLabel: 'Success %',
  thresholdLabel: 'Threshold',
  actualLabel: 'Actual value',
  expectedLabel: 'Expected value',
  failureSampleLabel: 'Failure sample',
  affectedRecordsLabel: 'Affected records',
  expectations: {
    'EXP-DT-001': 'Row count = X',
    'EXP-DT-007': 'Not null',
    'EXP-DT-012': 'Between X and Y',
  },
};

function baseRun(overrides = {}) {
  return {
    _id: 'run-1',
    datasetName: 'afiliados.xlsx',
    executedAt: '2026-07-01T10:00:00.000Z',
    overallStatus: 'failed',
    columnCoverage: [
      { expectedColumn: 'nombre', found: true },
      { expectedColumn: 'edad', found: true },
    ],
    results: [
      {
        expId: 'EXP-DT-007',
        column: 'nombre',
        status: 'passed',
        threshold: 100,
        successPercent: 100,
        unexpectedSample: [],
        affectedRecords: [],
      },
      {
        expId: 'EXP-DT-012',
        column: 'edad',
        status: 'failed',
        threshold: 100,
        successPercent: 80,
        unexpectedSample: [150, -3],
        affectedRecords: [{ rowId: 3, businessId: '30111222' }],
      },
    ],
    ...overrides,
  };
}

describe('groupResultsByColumn', () => {
  test('agrupa por columna, respetando el orden de columnCoverage', () => {
    const run = baseRun({
      results: [
        { expId: 'EXP-DT-012', column: 'edad', status: 'passed' },
        { expId: 'EXP-DT-001', column: null, status: 'passed' }, // nivel Tabla
        { expId: 'EXP-DT-007', column: 'nombre', status: 'passed' },
      ],
    });
    const groups = groupResultsByColumn(run, 'Table level');
    expect(groups.map((g) => g.key)).toEqual(['Table level', 'nombre', 'edad']);
  });
});

describe('buildValidationRunPdf', () => {
  test('genera el PDF a partir de un ValidationRun mock sin tirar excepción', () => {
    const run = baseRun();
    expect(() => buildValidationRunPdf({ run, suiteName: 'Suite de Afiliados', labels: LABELS })).not.toThrow();
  });

  test('sanitiza (safeText) los valores de unexpectedSample antes de dibujarlos', async () => {
    const reportPdfModule = await import('../src/utils/reportPdf');
    const safeTextSpy = vi.spyOn(reportPdfModule, 'safeText');

    const run = baseRun({
      results: [
        {
          expId: 'EXP-DT-012',
          column: 'edad',
          status: 'failed',
          threshold: 100,
          successPercent: 50,
          unexpectedSample: ['áéíóú-ñ'],
          affectedRecords: [],
        },
      ],
    });
    buildValidationRunPdf({ run, suiteName: 'Suite áéñ', labels: LABELS });

    expect(safeTextSpy).toHaveBeenCalledWith('áéíóú-ñ');
    safeTextSpy.mockRestore();
  });

  test('ValidationRun con results vacío genera el PDF igual, mostrando solo Cobertura', () => {
    const run = baseRun({ results: [] });
    const doc = buildValidationRunPdf({ run, suiteName: 'Suite de Afiliados', labels: LABELS });
    expect(doc.internal.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  test('muchas expectativas falladas (fixture grande) no lanza error de paginación', () => {
    const manyColumns = Array.from({ length: 40 }, (_, index) => `columna_${index}`);
    const run = baseRun({
      columnCoverage: manyColumns.map((column) => ({ expectedColumn: column, found: true })),
      results: manyColumns.map((column) => ({
        expId: 'EXP-DT-012',
        column,
        status: 'failed',
        threshold: 100,
        successPercent: 10,
        unexpectedSample: Array.from({ length: 20 }, (_, i) => `valor-invalido-${column}-${i}`),
        affectedRecords: Array.from({ length: 20 }, (_, i) => ({ rowId: i, businessId: `id-${i}` })),
      })),
    });

    let doc;
    expect(() => {
      doc = buildValidationRunPdf({ run, suiteName: 'Suite grande', labels: LABELS });
    }).not.toThrow();
    expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1);
  });
});
