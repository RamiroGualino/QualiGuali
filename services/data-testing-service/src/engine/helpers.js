// Etapa 3 (docs/data-testing/etapa-3-motor-de-evaluacion.md) — piezas
// compartidas por columnExpectations.js y multicolumnExpectations.js, para
// no repetir 29 veces (25 de columna + 4 multicolumna) el mismo tally de
// evaluado/cumplido/muestra/threshold/affectedRecords.

function round2(value) {
  return Math.round(value * 100) / 100;
}

function isEmpty(value) {
  return value === null || value === undefined || value === '';
}

// Los valores llegan como número real (.xlsx/.ods, vía SheetJS) o como
// string (.csv, siempre texto plano) — cualquiera de los dos formatos debe
// poder evaluarse igual (etapa-2's propia nota de arquitectura). `null`
// para "no es un número válido", nunca NaN suelto (evita comparaciones
// silenciosamente falsas tipo `NaN <= x`).
function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (isEmpty(value)) return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

// Deliberadamente laxo (mismo espíritu que el "dateutil parseable" de Great
// Expectations, ver EXP-DT-021) — sólo exige que Date.parse reconozca el
// string, no un formato específico.
function isDateParseable(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (isEmpty(value)) return false;
  return !Number.isNaN(Date.parse(String(value).trim()));
}

// EXP-DT-010/011 (tipo de dato): infiere un tipo lógico incluso desde texto
// plano de CSV — "42" debe reconocerse como número aunque venga como string,
// no sólo cuando SheetJS ya lo parseó como Number real desde un .xlsx.
function inferType(value) {
  if (isEmpty(value)) return 'null';
  if (value instanceof Date) return 'date';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';

  const trimmed = String(value).trim();
  if (/^(true|false)$/i.test(trimmed)) return 'boolean';
  if (toNumber(trimmed) !== null) return 'number';
  if (isDateParseable(trimmed)) return 'date';
  return 'text';
}

// Contrato compartido de evaluación por-fila (BR-DT-004/REQ-DT-006): recorre
// `records`, aplica `predicate(record) -> boolean`, arma successPercent y
// `status` según `threshold`, trunca la muestra de fallos a `sampleLimit`
// (pero `totalUnexpected` siempre es el conteo real), y arma
// `affectedRecords` con `businessId` sólo si `businessIdColumn` está
// definida y esa fila puntual tiene el dato cargado (BR-DT-006).
function tallyRecords(
  records,
  predicate,
  { threshold = 100, sampleLimit = 20, businessIdColumn = null, sampleValue = () => null } = {},
) {
  const evaluated = records.length;
  const unexpected = [];
  let matched = 0;

  records.forEach((record) => {
    if (predicate(record)) {
      matched += 1;
    } else {
      unexpected.push(record);
    }
  });

  const successPercent = evaluated === 0 ? 100 : round2((matched / evaluated) * 100);
  const status = successPercent >= threshold ? 'passed' : 'failed';
  const sample = unexpected.slice(0, sampleLimit);

  return {
    status,
    successPercent,
    evaluated,
    matched,
    unexpectedSample: sample.map(sampleValue),
    sampleLimit,
    totalUnexpected: unexpected.length,
    affectedRecords: sample.map((record) => ({
      rowId: record._rowId,
      businessId:
        businessIdColumn && !isEmpty(record[businessIdColumn])
          ? String(record[businessIdColumn])
          : null,
    })),
  };
}

// EXP-DT-023 a 031 (Estadística): a diferencia de tallyRecords, acá no hay
// un pass/fail por fila — es un único valor agregado (media, suma, etc.)
// comparado contra un rango o conjunto. `threshold` no aplica (no hay "% de
// filas cumpliendo" cuando lo que se evalúa es un solo número calculado
// sobre toda la columna). Cuando falla, el valor calculado se guarda en
// `unexpectedSample` (único elemento) para que el reporte pueda mostrar
// "media calculada: 45.2, esperado entre 50 y 60" sin necesitar un campo
// nuevo en el schema. `evaluatedCount` lo decide cada evaluador (numérico
// para max/min/media/mediana/desvío/suma vía `numericValuesOf`; cualquier
// valor no vacío para conteo/proporción de únicos y "valor más común" vía
// `nonEmptyValuesOf`, ya que esos no son necesariamente numéricos).
function buildAggregateResult(evaluatedCount, value, passed) {
  return {
    status: passed ? 'passed' : 'failed',
    successPercent: passed ? 100 : 0,
    evaluated: evaluatedCount,
    matched: passed ? evaluatedCount : 0,
    unexpectedSample: passed ? [] : [value],
    sampleLimit: null,
    totalUnexpected: passed ? 0 : 1,
    affectedRecords: [],
  };
}

function numericValuesOf(records, column) {
  return records.map((record) => toNumber(record[column])).filter((v) => v !== null);
}

function nonEmptyValuesOf(records, column) {
  return records
    .map((record) => record[column])
    .filter((v) => !isEmpty(v))
    .map((v) => String(v).trim());
}

function mean(numbers) {
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Desvío estándar muestral (ddof=1, divide por n-1) — mismo default que
// pandas .std()/Great Expectations' expect_column_stdev_to_be_between.
function stdev(numbers) {
  if (numbers.length < 2) return 0;
  const avg = mean(numbers);
  const variance = numbers.reduce((sum, n) => sum + (n - avg) ** 2, 0) / (numbers.length - 1);
  return Math.sqrt(variance);
}

function sum(numbers) {
  return numbers.reduce((total, n) => total + n, 0);
}

module.exports = {
  round2,
  isEmpty,
  toNumber,
  isDateParseable,
  inferType,
  tallyRecords,
  buildAggregateResult,
  numericValuesOf,
  nonEmptyValuesOf,
  mean,
  median,
  stdev,
  sum,
};
