import * as XLSX from 'xlsx';

// Binary spreadsheet formats — must go through file.arrayBuffer() since
// they're zip/binary containers, not text.
const BINARY_EXTENSIONS = ['.xlsx', '.xls', '.xlsb', '.ods'];

// Parses any spreadsheet file SheetJS understands (xlsx, xls, csv, ods, a
// .txt with CSV inside, ...) into the same { headers, records } shape
// utils/csv.js's parseCsvObjects returns, so callers don't need to care
// which format the user uploaded.
// Assumes the first non-blank row is the header row — good enough for a
// file exported from Excel/Google Sheets/ChatGPT, which is the target use
// case (a column-mapping step downstream lets the user correct anything
// this guesses wrong).
export async function parseSpreadsheetFile(file) {
  const isBinaryFormat = BINARY_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
  // CSV/TXT must be read as text (file.text() decodes UTF-8 correctly) and
  // fed to SheetJS as a string — reading them as a raw ArrayBuffer instead
  // makes SheetJS's CSV parser treat each byte as one Latin-1 character,
  // turning accented UTF-8 text (2+ bytes each) into mojibake like "Ã³".
  const workbook = isBinaryFormat
    ? XLSX.read(await file.arrayBuffer(), { type: 'array' })
    : XLSX.read(await file.text(), { type: 'string' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: false });

  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow || []).map((cell) => String(cell ?? '').trim());

  const records = dataRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '').trim()])),
  );

  return { headers, records };
}

// Writes a blank .xlsx with a single header row (no data rows) — a ready-
// to-fill template for whoever's building test cases outside QualiGuali
// (a teammate, ChatGPT, ...), matching whatever column set/order the
// caller hands in. Re-uploading the filled-in file through the Excel
// Transformer works even without renaming headers, since its own mapping
// step doesn't require exact column names.
export function downloadSpreadsheetTemplate(filename, headers) {
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Test cases');
  XLSX.writeFile(workbook, filename);
}

// Same idea, but with data: writes a real .xlsx with a header row followed
// by one row per entry in `rows` (each a plain array in the same order as
// `headers`) — e.g. for exporting to a fixed external template like
// Kualitee's import format, where both the column names and their order
// matter.
export function downloadSpreadsheetRows(filename, headers, rows) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Test cases');
  XLSX.writeFile(workbook, filename);
}
