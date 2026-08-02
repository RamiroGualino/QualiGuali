// Etapa 3 (docs/data-testing/etapa-3-motor-de-evaluacion.md) — EXP-DT-001 a
// 006 (etapa-0 §6.1). Estructurales: sin threshold, sin muestra de fallos,
// sin affectedRecords — cada evaluador devuelve { status, expected, actual }
// (nunca successPercent/evaluated/matched, que son del contrato de
// columna/multicolumna). Firma común: (records, headers, params).

function rowCountEquals(records, _headers, params) {
  const actual = records.length;
  return { status: actual === params.count ? 'passed' : 'failed', expected: params.count, actual };
}

function rowCountBetween(records, _headers, params) {
  const actual = records.length;
  const passed = actual >= params.min && actual <= params.max;
  return { status: passed ? 'passed' : 'failed', expected: { min: params.min, max: params.max }, actual };
}

function columnCountEquals(_records, headers, params) {
  const actual = headers.length;
  return { status: actual === params.count ? 'passed' : 'failed', expected: params.count, actual };
}

function columnCountBetween(_records, headers, params) {
  const actual = headers.length;
  const passed = actual >= params.min && actual <= params.max;
  return { status: passed ? 'passed' : 'failed', expected: { min: params.min, max: params.max }, actual };
}

// Lista exacta, EN ORDEN — comparación posicional estricta.
function columnsMatchOrderedList(_records, headers, params) {
  const expected = params.columns || [];
  const passed =
    expected.length === headers.length && expected.every((column, index) => column === headers[index]);
  return { status: passed ? 'passed' : 'failed', expected, actual: headers };
}

// Mismo conjunto, sin importar orden.
function columnsMatchSet(_records, headers, params) {
  const expected = params.columns || [];
  const expectedSet = new Set(expected);
  const actualSet = new Set(headers);
  const passed =
    expectedSet.size === actualSet.size && [...expectedSet].every((column) => actualSet.has(column));
  return { status: passed ? 'passed' : 'failed', expected, actual: headers };
}

module.exports = {
  rowCountEquals,
  rowCountBetween,
  columnCountEquals,
  columnCountBetween,
  columnsMatchOrderedList,
  columnsMatchSet,
};
