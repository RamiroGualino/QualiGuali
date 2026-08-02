const mongoose = require('mongoose');

// BR-DT-003: por columna esperada de la Suite, si se encontró o no en el
// archivo de esta Corrida en particular — estructural, sin porcentaje.
const columnCoverageSchema = new mongoose.Schema(
  {
    expectedColumn: { type: String, required: true },
    found: { type: Boolean, required: true },
  },
  { _id: false },
);

// BR-DT-002: el resultado del matching de columnas (Etapa 2) tal como quedó
// aplicado a esta Corrida — incluye las correcciones manuales del usuario
// (matchType: 'manual'), no solo la sugerencia automática.
const columnMappingSchema = new mongoose.Schema(
  {
    expectedColumn: { type: String, required: true },
    matchedColumn: { type: String, default: null },
    matchType: { type: String, enum: ['exact', 'fuzzy', 'manual', 'not_found'], required: true },
  },
  { _id: false },
);

// BR-DT-001/BR-DT-006: _rowId siempre presente (trazabilidad de fila);
// businessId solo si la Suite definió una columna identificadora Y esa fila
// puntual tiene ese dato cargado — si no, queda `null`, nunca se omite.
const affectedRecordSchema = new mongoose.Schema(
  {
    rowId: { type: Number, required: true },
    businessId: { type: String, default: null },
  },
  { _id: false },
);

// Un resultado por Expectativa evaluada (BR-DT-003: las de una columna no
// encontrada simplemente no generan entrada acá). `unexpectedSample` se
// trunca a `sampleLimit`, `totalUnexpected` siempre es el conteo real (Etapa
// 3) — así el reporte puede decir "50 no conformes, mostrando 20".
//
// Extendido durante la implementación del motor de evaluación (Etapa 3,
// docs/data-testing/etapa-3-motor-de-evaluacion.md) respecto de lo que
// planteaba Etapa 1: los evaluadores de nivel Tabla no devuelven
// successPercent/evaluated/etc. — devuelven { status, expected, actual }
// (estructural, ver etapa-3 §"Contrato de cada evaluador"), así que
// `expected`/`actual` no tenían dónde guardarse. Y los de Multicolumna
// reciben `columns: string[]` en vez de `column: string`, mismo criterio
// que ExpectationSuite.expectations ya usa (`column` para scope:'column',
// `columns` para scope:'multicolumn').
const resultSchema = new mongoose.Schema(
  {
    expId: { type: String, required: true },
    column: { type: String, default: null }, // scope: 'column'
    columns: { type: [String], default: undefined }, // scope: 'multicolumn'
    status: { type: String, enum: ['passed', 'failed'], required: true },
    threshold: { type: Number, default: null },
    successPercent: { type: Number, default: null },
    evaluated: { type: Number, default: null },
    matched: { type: Number, default: null },
    unexpectedSample: { type: [mongoose.Schema.Types.Mixed], default: [] },
    sampleLimit: { type: Number, default: null },
    totalUnexpected: { type: Number, default: null },
    affectedRecords: { type: [affectedRecordSchema], default: [] },
    expected: { type: mongoose.Schema.Types.Mixed, default: undefined }, // solo scope: 'table'
    actual: { type: mongoose.Schema.Types.Mixed, default: undefined }, // solo scope: 'table'
  },
  { _id: false },
);

// Etapa 1 (docs/data-testing/etapa-1-modelo-de-datos.md): una ejecución
// manual (REQ-DT-008) de una ExpectationSuite contra un archivo subido en el
// momento — el registro histórico completo de esa corrida, incluido un
// snapshot inmutable de las Expectativas tal como estaban al ejecutarse
// (BR-DT-005), para que editar la Suite después no altere corridas pasadas.
const validationRunSchema = new mongoose.Schema(
  {
    // ObjectId + ref sí corresponde acá: ExpectationSuite vive en este mismo
    // servicio/base (referencia local real), a diferencia de projectId/
    // executedBy abajo.
    suiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpectationSuite',
      required: true,
      index: true,
    },
    suiteSnapshotVersion: { type: Number, required: true },
    // Copia inmutable de `expectations` de la Suite al momento de correr —
    // Mixed porque es literalmente una copia del array de expectationSchema,
    // no una referencia (BR-DT-005).
    suiteSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    // String, no ObjectId — ver la misma nota en ExpectationSuite.projectId.
    projectId: { type: String, required: true, index: true },
    datasetName: { type: String, required: true },
    // String, no ObjectId — ver la misma nota en ExpectationSuite.createdBy.
    executedBy: { type: String, required: true },
    executedAt: { type: Date, default: Date.now },
    durationMs: { type: Number, default: null },
    overallStatus: { type: String, enum: ['passed', 'failed'], required: true },
    columnCoverage: { type: [columnCoverageSchema], default: [] },
    columnMapping: { type: [columnMappingSchema], default: [] },
    results: { type: [resultSchema], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

validationRunSchema.index({ suiteId: 1, executedAt: -1 });

module.exports = mongoose.model('ValidationRun', validationRunSchema, 'data_testing_validationRuns');
