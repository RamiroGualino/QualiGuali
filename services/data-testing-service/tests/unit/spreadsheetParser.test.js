const fs = require('fs');
const path = require('path');
const { parseSpreadsheetBuffer } = require('../../src/utils/spreadsheetParser');

const fixture = (name) =>
  fs.readFileSync(path.join(__dirname, '../__fixtures__/spreadsheets', name));

describe('parseSpreadsheetBuffer', () => {
  test('parsea un .xlsx: headers correctos, cantidad de records correcta', () => {
    const { headers, records } = parseSpreadsheetBuffer(fixture('valid.xlsx'), 'valid.xlsx');

    expect(headers).toEqual(['nombre', 'edad', 'email']);
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ nombre: 'Ana Pérez', edad: 34, email: 'ana@example.com' });
  });

  test('cada record tiene _rowId secuencial empezando en 1', () => {
    const { records } = parseSpreadsheetBuffer(fixture('valid.xlsx'), 'valid.xlsx');
    expect(records.map((record) => record._rowId)).toEqual([1, 2, 3]);
  });

  test('_rowId nunca aparece en headers (no es una columna de datos real)', () => {
    const { headers } = parseSpreadsheetBuffer(fixture('valid.xlsx'), 'valid.xlsx');
    expect(headers).not.toContain('_rowId');
  });

  test('parsea .csv con el mismo resultado estructural que .xlsx, sin romper acentos', () => {
    const { headers, records } = parseSpreadsheetBuffer(fixture('valid.csv'), 'valid.csv');

    expect(headers).toEqual(['nombre', 'edad', 'email']);
    expect(records).toHaveLength(3);
    expect(records[0].nombre).toBe('Ana Pérez');
    expect(records[1].nombre).toBe('Luis Gómez');
    expect(records[2].nombre).toBe('Marta Díaz');
  });

  test('parsea .ods con el mismo resultado estructural que .xlsx', () => {
    const { headers, records } = parseSpreadsheetBuffer(fixture('valid.ods'), 'valid.ods');

    expect(headers).toEqual(['nombre', 'edad', 'email']);
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({ nombre: 'Ana Pérez', edad: 34, email: 'ana@example.com' });
  });

  test('archivo vacío (solo headers, sin filas) — records: [], sin error', () => {
    const { headers, records } = parseSpreadsheetBuffer(fixture('empty.xlsx'), 'empty.xlsx');

    expect(headers).toEqual(['nombre', 'edad', 'email']);
    expect(records).toEqual([]);
  });
});
