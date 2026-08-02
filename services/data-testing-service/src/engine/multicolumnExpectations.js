// Etapa 3 (docs/data-testing/etapa-3-motor-de-evaluacion.md) — EXP-DT-032 a
// 035 (etapa-0 §6.3). Firma común: (records, columns, params, opts) —
// `columns: string[]` en vez de `column: string` (a diferencia de
// columnExpectations.js), mismo shape de retorno (etapa-3's propia nota).
const { toNumber, tallyRecords, round2 } = require('./helpers');

// EXP-DT-032 — Columna A > Columna B (u "o igual"). Valores no numéricos en
// cualquiera de las dos columnas hacen fallar esa fila (no hay nada
// razonable que comparar).
function columnPairGreaterThan(records, columns, params, opts) {
  const [columnA, columnB] = columns;
  return tallyRecords(
    records,
    (record) => {
      const a = toNumber(record[columnA]);
      const b = toNumber(record[columnB]);
      if (a === null || b === null) return false;
      return params.orEqual ? a >= b : a > b;
    },
    { ...opts, sampleValue: (record) => ({ [columnA]: record[columnA], [columnB]: record[columnB] }) },
  );
}

// EXP-DT-033 — Columna A = Columna B (comparación por valor, como texto —
// "10" y 10 se consideran iguales, ya que .xlsx entrega números reales y
// .csv siempre entrega strings para el mismo dato lógico). No usa `params`
// (nada que configurar más allá de las columnas), pero mantiene la misma
// firma (records, columns, params, opts) que el resto — runEngine.js llama
// a todos los evaluadores de multicolumna de forma uniforme.
function columnPairEqual(records, columns, _params, opts) {
  const [columnA, columnB] = columns;
  return tallyRecords(
    records,
    (record) => String(record[columnA] ?? '').trim() === String(record[columnB] ?? '').trim(),
    { ...opts, sampleValue: (record) => ({ [columnA]: record[columnA], [columnB]: record[columnB] }) },
  );
}

// EXP-DT-034 — combinación de 2+ columnas única por fila (misma idea que
// EXP-DT-009, pero con una clave compuesta en vez de un solo valor). Tampoco
// usa `params` — misma razón que columnPairEqual arriba.
function combinationUniqueWithinRecord(records, columns, _params, opts) {
  const keyOf = (record) => columns.map((column) => String(record[column] ?? '')).join('');
  const frequency = new Map();
  records.forEach((record) => {
    const key = keyOf(record);
    frequency.set(key, (frequency.get(key) || 0) + 1);
  });
  return tallyRecords(records, (record) => frequency.get(keyOf(record)) === 1, {
    ...opts,
    sampleValue: (record) => Object.fromEntries(columns.map((column) => [column, record[column]])),
  });
}

// EXP-DT-035 — suma de las columnas indicadas = X, evaluada fila por fila
// (no un agregado sobre todo el dataset) — mismo criterio que
// expect_multicolumn_sum_to_equal de Great Expectations.
function multicolumnSumEquals(records, columns, params, opts) {
  return tallyRecords(
    records,
    (record) => {
      const values = columns.map((column) => toNumber(record[column]));
      if (values.some((value) => value === null)) return false;
      return round2(values.reduce((total, value) => total + value, 0)) === round2(params.target);
    },
    {
      ...opts,
      sampleValue: (record) => Object.fromEntries(columns.map((column) => [column, record[column]])),
    },
  );
}

module.exports = {
  columnPairGreaterThan,
  columnPairEqual,
  combinationUniqueWithinRecord,
  multicolumnSumEquals,
};
