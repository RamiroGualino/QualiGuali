// Hand-rolled CSV — no xlsx/papaparse dependency. A real .xlsx file is a
// binary ZIP+XML format that can't be read/written by hand; CSV is the
// dependency-free stand-in Excel opens/edits/saves natively, keeping the
// same column names/order as the Kualitee-style template.
function escapeCsvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// columns: [{ key, header }], rows: plain objects (or use `get` per column
// for derived values not stored directly on the row).
export function downloadCsv(filename, columns, rows) {
  const headerLine = columns.map((column) => escapeCsvCell(column.header)).join(',');
  const lines = rows.map((row) =>
    columns
      .map((column) => escapeCsvCell(column.get ? column.get(row) : row[column.key]))
      .join(','),
  );
  const csvContent = [headerLine, ...lines].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// RFC4180-ish parser: handles quoted cells containing commas/newlines and
// "" as an escaped quote. Returns raw rows (arrays of cells) — the caller
// is responsible for treating the first row as a header.
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  // Normalizing \r\n up front keeps the state machine below single-pass and
  // free of lookahead for the two-character line ending.
  const normalized = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// Parses a CSV file's text into header-keyed row objects, matching columns
// by header name (order-independent) so the importer stays robust to
// reordered columns while still exporting in a fixed, documented order.
export function parseCsvObjects(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { headers: [], records: [] };

  const [headerRow, ...dataRows] = rows;
  const records = dataRows.map((cells) =>
    Object.fromEntries(headerRow.map((header, index) => [header, cells[index] ?? ''])),
  );
  return { headers: headerRow, records };
}
