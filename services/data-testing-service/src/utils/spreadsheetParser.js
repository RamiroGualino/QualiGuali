const XLSX = require('xlsx');

// Etapa 2 (docs/data-testing/etapa-2-parser-y-matching.md) — nota de
// arquitectura: esto corre server-side (multer sube el archivo al backend),
// no en el browser como apps/web/src/utils/spreadsheet.js. Misma librería
// (xlsx/SheetJS tiene build para Node y para browser bajo el mismo paquete
// npm), ejecutada del lado del servicio.
//
// Parsea un buffer de Excel (.xlsx/.xls), CSV o ODS y devuelve
// { headers, records }. Cada record incluye `_rowId` (BR-DT-001): número de
// fila secuencial, 1-indexed, sin contar el header — nunca se expone como
// columna de datos real (headers nunca contiene "_rowId").
function parseSpreadsheetBuffer(buffer, filename) {
  // CSV es texto plano — pasarlo como Buffer directo a XLSX.read({type:
  // 'buffer'}) le hace adivinar el encoding y rompe acentos/ñ (verificado:
  // "Pérez" salía como "PÃ©rez"). Decodificarlo nosotros mismos como UTF-8 y
  // pasarlo como string evita esa detección incorrecta. .xlsx/.ods son ZIP
  // binario — esos sí van como Buffer, nunca como string.
  const isCsv = String(filename).toLowerCase().endsWith('.csv');

  let workbook;
  try {
    workbook = isCsv
      ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
      : XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    const wrapped = new Error(
      `No se pudo parsear "${filename}" como Excel/CSV/ODS: ${err.message}`,
    );
    wrapped.status = 400;
    throw wrapped;
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) {
    return { headers: [], records: [] };
  }

  // header: 1 -> array de arrays (la primera fila es el header, no se
  // interpreta como nombres de propiedad automáticamente) — necesario para
  // poder normalizar/controlar los nombres de columna nosotros mismos
  // (Etapa 2, columnMatching.js) en vez de dejar que SheetJS los infiera.
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });

  if (rows.length === 0) {
    return { headers: [], records: [] };
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((header) =>
    header === null || header === undefined ? '' : String(header).trim(),
  );

  const records = dataRows.map((row, index) => {
    const record = { _rowId: index + 1 };
    headers.forEach((header, columnIndex) => {
      record[header] = row[columnIndex] === undefined ? null : row[columnIndex];
    });
    return record;
  });

  return { headers, records };
}

module.exports = { parseSpreadsheetBuffer };
