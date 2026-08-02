const mongoose = require('mongoose');

// Todo el catálogo (docs/data-testing/etapa-0-especificacion-funcional.md,
// sección 6) — completo desde v1, no hay subset curado (etapa-0 §6: "no se
// conoce de antemano qué tipo de datos va a traer cada archivo").
const EXPECTATION_IDS = [
  // 6.1 Nivel Tabla
  'EXP-DT-001',
  'EXP-DT-002',
  'EXP-DT-003',
  'EXP-DT-004',
  'EXP-DT-005',
  'EXP-DT-006',
  // 6.2 Nivel Columna
  'EXP-DT-007',
  'EXP-DT-008',
  'EXP-DT-009',
  'EXP-DT-010',
  'EXP-DT-011',
  'EXP-DT-012',
  'EXP-DT-013',
  'EXP-DT-014',
  'EXP-DT-015',
  'EXP-DT-016',
  'EXP-DT-017',
  'EXP-DT-018',
  'EXP-DT-019',
  'EXP-DT-020',
  'EXP-DT-021',
  'EXP-DT-022',
  'EXP-DT-023',
  'EXP-DT-024',
  'EXP-DT-025',
  'EXP-DT-026',
  'EXP-DT-027',
  'EXP-DT-028',
  'EXP-DT-029',
  'EXP-DT-030',
  'EXP-DT-031',
  // 6.3 Nivel Multicolumna
  'EXP-DT-032',
  'EXP-DT-033',
  'EXP-DT-034',
  'EXP-DT-035',
];

// Etapa 1 (docs/data-testing/etapa-1-modelo-de-datos.md): una regla
// individual de calidad dentro de una Suite. `params` es Mixed porque su
// forma depende de `expId` (ej. {min,max} para "entre X e Y", {pattern}
// para regex, {values:[]} para "en el conjunto") — el motor de evaluación
// (Etapa 3) es quien conoce/valida esa forma, no este schema.
const expectationSchema = new mongoose.Schema(
  {
    expId: { type: String, required: true, enum: EXPECTATION_IDS },
    scope: { type: String, required: true, enum: ['table', 'column', 'multicolumn'] },
    column: { type: String, default: null }, // requerido (a nivel negocio) si scope === 'column'
    columns: { type: [String], default: undefined }, // requerido si scope === 'multicolumn'
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Umbral (BR-DT-004): default 100, solo tiene sentido para scope
    // column/multicolumn (las de nivel table son binarias, etapa-0 §6.4) —
    // no se fuerza a null para 'table' a nivel schema, simplemente no se
    // lee ni se muestra para ese scope en el resto de las etapas.
    threshold: { type: Number, default: 100, min: 0, max: 100 },
  },
  { _id: false },
);

// Etapa 6.2 (docs/data-testing/etapa-6.2-selector-por-tipo-de-dato.md): cada
// columna esperada ahora guarda también su tipo de dato — definido a mano
// por el usuario en el frontend (nunca inferido/heurística), usado ahí para
// filtrar qué expectativas de Columna tiene sentido ofrecer. `sin_definir`
// es un valor legítimo, no un placeholder de error — significa "sin filtro,
// mostrar el catálogo completo".
const expectedColumnSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    tipoDato: {
      type: String,
      enum: ['numero', 'texto', 'fecha', 'sin_definir'],
      default: 'sin_definir',
    },
  },
  { _id: false },
);

// Etapa 2 (docs/postman-runner/etapa-2-gestion-de-suites.md) tiene su propio
// PostmanSuite — esta es la versión de Test de Datos: una colección
// reutilizable de Expectativas contra archivos de datos (Excel/CSV/ODS),
// versionada por snapshot en cada Corrida (BR-DT-005).
const expectationSuiteSchema = new mongoose.Schema(
  {
    // String, no ObjectId/ref: referencia lógica a projects-service
    // (validada por HTTP en Etapa 4), misma convención que projectId en
    // PostmanSuite/AutomationRun/Defect/TestSuite — nunca un FK local.
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // REQ-DT-006: límite de "muestra de fallos" por Expectativa.
    sampleLimit: { type: Number, default: 20, min: 1, max: 100 },
    // REQ-DT-007: columna identificadora de negocio opcional (ej. DNI),
    // enriquece — no reemplaza — el _rowId (BR-DT-006).
    businessIdColumn: { type: String, default: null },
    // Detectadas del archivo de referencia al crear/editar la Suite
    // (REQ-DT-002) — la lista de columnas que el matching (Etapa 2) intenta
    // emparejar contra cada archivo de una Corrida. `[{name, tipoDato}]`
    // desde la Etapa 6.2 (antes `[String]`) — ver expectedColumnSchema.
    expectedColumns: { type: [expectedColumnSchema], default: [] },
    expectations: { type: [expectationSchema], default: [] },
    // Se incrementa en cada update (Etapa 4, PUT /api/suites/:id) —
    // BR-DT-005: cada ValidationRun guarda con qué versión de las
    // Expectativas corrió, así una edición posterior de la Suite no altera
    // corridas pasadas.
    version: { type: Number, default: 1 },
    // String, no ObjectId — el userId del JWT se guarda como String en todo
    // el resto del monorepo (PostmanSuite.createdBy, AutomationRun.triggeredBy,
    // Execution.executedBy, etc.), nunca casteado a ObjectId.
    createdBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model(
  'ExpectationSuite',
  expectationSuiteSchema,
  'data_testing_expectationSuites',
);
