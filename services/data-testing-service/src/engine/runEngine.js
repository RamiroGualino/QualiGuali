const registry = require('./registry');

// BR-DT-003: `found: true/false` según si `matchColumns` (Etapa 2, ya con
// las correcciones manuales del usuario aplicadas encima) encontró esa
// columna esperada en el archivo — puramente estructural, un elemento por
// cada `expectedColumn` de la Suite.
function buildColumnCoverage(columnMapping) {
  return columnMapping.map((mapping) => ({
    expectedColumn: mapping.expectedColumn,
    found: mapping.matchType !== 'not_found',
  }));
}

function resolveMatchedColumn(columnMapping, expectedColumn) {
  const mapping = columnMapping.find((entry) => entry.expectedColumn === expectedColumn);
  return mapping && mapping.matchType !== 'not_found' ? mapping.matchedColumn : null;
}

// Etapa 3 (docs/data-testing/etapa-3-motor-de-evaluacion.md): recorre las
// Expectativas de un snapshot de Suite (BR-DT-005 — ya congelado por el
// caller, Etapa 5), invoca el evaluador correspondiente vía `registry`, y
// arma `columnCoverage`/`results` respetando BR-DT-003 (una columna
// esperada no encontrada salta sus Expectativas, no las marca ni pass ni
// fail — simplemente no generan entrada en `results`).
//
// `columnMapping` es el resultado final de matchColumns() (Etapa 2) con las
// correcciones manuales del usuario ya aplicadas encima — este módulo no
// hace matching, sólo lo consume.
function run({ records, headers, suiteSnapshot, columnMapping, sampleLimit, businessIdColumn }) {
  const columnCoverage = buildColumnCoverage(columnMapping);
  // El propio businessIdColumn de la Suite también puede no estar en el
  // archivo — en ese caso ninguna fila puede enriquecerse con él
  // (BR-DT-006 degrada a businessId: null para todas, nunca rompe la
  // corrida).
  const resolvedBusinessIdColumn = businessIdColumn
    ? resolveMatchedColumn(columnMapping, businessIdColumn)
    : null;

  const results = [];

  suiteSnapshot.forEach((expectation) => {
    const evaluator = registry[expectation.expId];
    if (!evaluator) return; // expId desconocido — no debería pasar (enum ya validado al guardar la Suite)

    if (expectation.scope === 'table') {
      const { status, expected, actual } = evaluator(records, headers, expectation.params || {});
      results.push({ expId: expectation.expId, status, expected, actual });
      return;
    }

    const opts = {
      threshold: expectation.threshold,
      sampleLimit,
      businessIdColumn: resolvedBusinessIdColumn,
    };

    if (expectation.scope === 'column') {
      const matchedColumn = resolveMatchedColumn(columnMapping, expectation.column);
      if (!matchedColumn) return; // BR-DT-003

      const result = evaluator(records, matchedColumn, expectation.params || {}, opts);
      // El evaluador no repite `threshold` en su resultado (ni siquiera lo
      // conoce para las 9 expectativas Estadística, que lo ignoran) — se
      // agrega acá para que el resultado persistido siempre refleje el
      // threshold configurado por el usuario, no el default null del schema.
      // `...result` va primero: si alguna vez un evaluador empezara a
      // devolver su propio `threshold`, éste (el configurado de verdad)
      // sigue ganando.
      results.push({
        expId: expectation.expId,
        column: expectation.column,
        ...result,
        threshold: expectation.threshold,
      });
      return;
    }

    if (expectation.scope === 'multicolumn') {
      const matchedColumns = expectation.columns.map((column) =>
        resolveMatchedColumn(columnMapping, column),
      );
      if (matchedColumns.some((column) => !column)) return; // BR-DT-003, extendida: cualquier columna faltante salta la expectativa

      const result = evaluator(records, matchedColumns, expectation.params || {}, opts);
      results.push({
        expId: expectation.expId,
        columns: expectation.columns,
        ...result,
        threshold: expectation.threshold,
      });
    }
  });

  const overallStatus = results.some((result) => result.status === 'failed') ? 'failed' : 'passed';

  return { columnCoverage, results, overallStatus };
}

module.exports = { run };
