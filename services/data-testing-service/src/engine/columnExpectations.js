// Etapa 3 (docs/data-testing/etapa-3-motor-de-evaluacion.md) — EXP-DT-007 a
// 031 (etapa-0 §6.2). Firma común: (records, column, params, opts), donde
// opts = { threshold, sampleLimit, businessIdColumn } (ver runEngine.js).
//
// null/undefined siempre se normalizan a '' vía `?? ''` antes de String(...)
// — sin eso, `String(null)` da el texto "null" (4 caracteres), que puede
// "matchear" un regex/longitud por accidente.
const {
  isEmpty,
  toNumber,
  isDateParseable,
  inferType,
  tallyRecords,
  buildAggregateResult,
  numericValuesOf,
  nonEmptyValuesOf,
  round2,
  mean,
  median,
  stdev,
  sum,
} = require('./helpers');

function byColumn(records, column, predicate, opts) {
  return tallyRecords(records, (record) => predicate(record[column], record), {
    ...opts,
    sampleValue: (record) => record[column],
  });
}

// --- Ausencia/Tipo ---

// EXP-DT-007
function notNull(records, column, _params, opts) {
  return byColumn(records, column, (value) => !isEmpty(value), opts);
}

// EXP-DT-008
function isNull(records, column, _params, opts) {
  return byColumn(records, column, (value) => isEmpty(value), opts);
}

// EXP-DT-009 — a diferencia del resto, necesita ver TODo el dataset antes de
// poder decidir fila por fila (una fila sola no sabe si es "única").
function isUnique(records, column, _params, opts) {
  const frequency = new Map();
  records.forEach((record) => {
    const key = String(record[column] ?? '');
    frequency.set(key, (frequency.get(key) || 0) + 1);
  });
  return byColumn(records, column, (value) => frequency.get(String(value ?? '')) === 1, opts);
}

// EXP-DT-010
function isOfType(records, column, params, opts) {
  return byColumn(records, column, (value) => inferType(value) === params.type, opts);
}

// EXP-DT-011
function isInTypeList(records, column, params, opts) {
  const types = params.types || [];
  return byColumn(records, column, (value) => types.includes(inferType(value)), opts);
}

// --- Rango/Set ---

// EXP-DT-012
function isBetween(records, column, params, opts) {
  return byColumn(
    records,
    column,
    (value) => {
      const n = toNumber(value);
      return n !== null && n >= params.min && n <= params.max;
    },
    opts,
  );
}

// EXP-DT-013
function isInSet(records, column, params, opts) {
  const values = (params.values || []).map((v) => String(v).trim());
  return byColumn(records, column, (value) => values.includes(String(value ?? '').trim()), opts);
}

// EXP-DT-014
function isNotInSet(records, column, params, opts) {
  const values = (params.values || []).map((v) => String(v).trim());
  return byColumn(records, column, (value) => !values.includes(String(value ?? '').trim()), opts);
}

// --- Texto ---

// EXP-DT-015
function lengthBetween(records, column, params, opts) {
  return byColumn(
    records,
    column,
    (value) => {
      const length = String(value ?? '').length;
      return length >= params.min && length <= params.max;
    },
    opts,
  );
}

// EXP-DT-016
function lengthEquals(records, column, params, opts) {
  return byColumn(records, column, (value) => String(value ?? '').length === params.length, opts);
}

// EXP-DT-017
function matchesRegex(records, column, params, opts) {
  const regex = new RegExp(params.pattern);
  return byColumn(records, column, (value) => regex.test(String(value ?? '')), opts);
}

// EXP-DT-018
function notMatchesRegex(records, column, params, opts) {
  const regex = new RegExp(params.pattern);
  return byColumn(records, column, (value) => !regex.test(String(value ?? '')), opts);
}

// EXP-DT-019
function matchesRegexList(records, column, params, opts) {
  const patterns = (params.patterns || []).map((pattern) => new RegExp(pattern));
  return byColumn(records, column, (value) => patterns.some((re) => re.test(String(value ?? ''))), opts);
}

// EXP-DT-020
function notMatchesRegexList(records, column, params, opts) {
  const patterns = (params.patterns || []).map((pattern) => new RegExp(pattern));
  return byColumn(
    records,
    column,
    (value) => !patterns.some((re) => re.test(String(value ?? ''))),
    opts,
  );
}

// EXP-DT-021
function isDateutilParseable(records, column, _params, opts) {
  return byColumn(records, column, (value) => isDateParseable(value), opts);
}

// EXP-DT-022
function isJsonParseable(records, column, _params, opts) {
  return byColumn(
    records,
    column,
    (value) => {
      if (isEmpty(value)) return false;
      try {
        JSON.parse(String(value));
        return true;
      } catch (_err) {
        return false;
      }
    },
    opts,
  );
}

// --- Estadística (EXP-DT-023 a 031): agregado sobre toda la columna, no
// por-fila — ver buildAggregateResult's propio comentario en helpers.js. ---

// EXP-DT-023
function maxBetween(records, column, params) {
  const numbers = numericValuesOf(records, column);
  if (numbers.length === 0) return buildAggregateResult(0, null, false);
  const value = Math.max(...numbers);
  return buildAggregateResult(numbers.length, value, value >= params.min && value <= params.max);
}

// EXP-DT-024
function minBetween(records, column, params) {
  const numbers = numericValuesOf(records, column);
  if (numbers.length === 0) return buildAggregateResult(0, null, false);
  const value = Math.min(...numbers);
  return buildAggregateResult(numbers.length, value, value >= params.min && value <= params.max);
}

// EXP-DT-025
function meanBetween(records, column, params) {
  const numbers = numericValuesOf(records, column);
  if (numbers.length === 0) return buildAggregateResult(0, null, false);
  const value = round2(mean(numbers));
  return buildAggregateResult(numbers.length, value, value >= params.min && value <= params.max);
}

// EXP-DT-026
function medianBetween(records, column, params) {
  const numbers = numericValuesOf(records, column);
  if (numbers.length === 0) return buildAggregateResult(0, null, false);
  const value = median(numbers);
  return buildAggregateResult(numbers.length, value, value >= params.min && value <= params.max);
}

// EXP-DT-027
function stdevBetween(records, column, params) {
  const numbers = numericValuesOf(records, column);
  if (numbers.length === 0) return buildAggregateResult(0, null, false);
  const value = round2(stdev(numbers));
  return buildAggregateResult(numbers.length, value, value >= params.min && value <= params.max);
}

// EXP-DT-028
function uniqueValueCountBetween(records, column, params) {
  const values = nonEmptyValuesOf(records, column);
  const value = new Set(values).size;
  return buildAggregateResult(values.length, value, value >= params.min && value <= params.max);
}

// EXP-DT-029
function proportionOfUniqueBetween(records, column, params) {
  const values = nonEmptyValuesOf(records, column);
  if (values.length === 0) return buildAggregateResult(0, null, false);
  const value = round2(new Set(values).size / values.length);
  return buildAggregateResult(values.length, value, value >= params.min && value <= params.max);
}

// EXP-DT-030
function mostCommonValueInSet(records, column, params) {
  const values = nonEmptyValuesOf(records, column);
  if (values.length === 0) return buildAggregateResult(0, null, false);

  const frequency = new Map();
  values.forEach((value) => frequency.set(value, (frequency.get(value) || 0) + 1));
  let mostCommon = null;
  let highestCount = -1;
  frequency.forEach((count, value) => {
    if (count > highestCount) {
      highestCount = count;
      mostCommon = value;
    }
  });

  const targetValues = (params.values || []).map((v) => String(v).trim());
  return buildAggregateResult(values.length, mostCommon, targetValues.includes(mostCommon));
}

// EXP-DT-031
function sumBetween(records, column, params) {
  const numbers = numericValuesOf(records, column);
  const value = round2(sum(numbers));
  return buildAggregateResult(numbers.length, value, value >= params.min && value <= params.max);
}

module.exports = {
  notNull,
  isNull,
  isUnique,
  isOfType,
  isInTypeList,
  isBetween,
  isInSet,
  isNotInSet,
  lengthBetween,
  lengthEquals,
  matchesRegex,
  notMatchesRegex,
  matchesRegexList,
  notMatchesRegexList,
  isDateutilParseable,
  isJsonParseable,
  maxBetween,
  minBetween,
  meanBetween,
  medianBetween,
  stdevBetween,
  uniqueValueCountBetween,
  proportionOfUniqueBetween,
  mostCommonValueInSet,
  sumBetween,
};
