# Etapa 1 — Modelo de datos (Mongoose)

**Deriva de:** `etapa-0-especificacion-funcional.md` — secciones 3, 4 (REQ-DT-001, 007, 010, 012),
5 (BR-DT-001 a 006), 7 (modelo conceptual).

## Contexto para Claude Code

Servicio nuevo, siguiendo el patrón ya establecido en el monorepo (ver
`docs/DOCUMENTACION_TECNICA.md`): Express + Mongoose, JWT verificado localmente vía
`@qualiguali/shared` (`createAuthenticate`, `requireRole`), Jest + Supertest +
`mongodb-memory-server` para tests (sin Mongo real en CI), ESLint/Prettier compartidos del repo,
Conventional Commits.

- **Nombre del servicio:** `data-testing-service`
- **Puerto:** `:4006` (siguiente libre tras los 6 servicios existentes: 4000–4005)
- **Base de datos propia:** `data_testing_db` (Mongo, consistente con "1 servicio = 1 base")
- **Ubicación:** `services/data-testing-service/` dentro del monorepo pnpm workspace
- **Scaffold:** calcar la estructura de `services/defects-service/` (es el más simple de los 6:
  Mongoose + Counter compartido + validación de `projectId` contra `projects-service`) — mismo
  `package.json` shape, mismo uso de `@qualiguali/shared`.

No implementar todavía rutas HTTP ni lógica de negocio en esta etapa — **solo modelos, schemas y
sus tests de validación.**

## Modelos a crear

### `src/models/ExpectationSuite.js`

```js
{
  projectId: { type: ObjectId, required: true, index: true }, // validado contra projects-service en etapa 4
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  sampleLimit: { type: Number, default: 20, min: 1, max: 100 }, // REQ-DT-006
  businessIdColumn: { type: String, default: null }, // REQ-DT-007, opcional
  expectedColumns: { type: [String], default: [] }, // detectadas del archivo de referencia
  expectations: {
    type: [{
      expId: { type: String, required: true, enum: [/* EXP-DT-001 ... EXP-DT-035, ver catálogo completo en etapa-0 sección 6 */] },
      scope: { type: String, required: true, enum: ['table', 'column', 'multicolumn'] },
      column: { type: String }, // requerido si scope === 'column'
      columns: { type: [String] }, // requerido si scope === 'multicolumn'
      params: { type: Schema.Types.Mixed, default: {} }, // shape depende del expId (ver nota abajo)
      threshold: { type: Number, default: 100, min: 0, max: 100 }, // solo aplica scope column/multicolumn — BR-DT-004
    }],
    default: [],
  },
  version: { type: Number, default: 1 }, // se incrementa en cada update — BR-DT-005
  createdBy: { type: ObjectId, required: true },
  timestamps: true,
}
```

**Nota sobre `params`:** el shape varía según `expId` — ej. `{min, max}` para las "entre X e Y",
`{values: []}` para "en el conjunto", `{pattern}` para regex, `{patterns: []}` para lista de
regex, `{type}` / `{types: []}` para tipo de dato, `{length}` para longitud exacta, `{target}` para
suma multicolumna. No se valida el shape a nivel Mongoose (es `Mixed`) — la validación de forma
correcta ocurre en el motor de evaluación (Etapa 3), no acá.

### `src/models/ValidationRun.js`

```js
{
  suiteId: { type: ObjectId, required: true, index: true },
  suiteSnapshotVersion: { type: Number, required: true }, // BR-DT-005
  suiteSnapshot: { type: Schema.Types.Mixed, required: true }, // copia inmutable de `expectations` al momento de correr
  projectId: { type: ObjectId, required: true, index: true },
  datasetName: { type: String, required: true },
  executedBy: { type: ObjectId, required: true },
  executedAt: { type: Date, default: Date.now },
  durationMs: { type: Number },
  overallStatus: { type: String, enum: ['passed', 'failed'], required: true },
  columnCoverage: {
    type: [{
      expectedColumn: String,
      found: Boolean,
    }],
    default: [],
  }, // BR-DT-003
  columnMapping: {
    type: [{
      expectedColumn: String,
      matchedColumn: String,
      matchType: { type: String, enum: ['exact', 'fuzzy', 'manual', 'not_found'] },
    }],
    default: [],
  }, // BR-DT-002
  results: {
    type: [{
      expId: String,
      column: String,
      status: { type: String, enum: ['passed', 'failed'] },
      threshold: Number,
      successPercent: Number,
      evaluated: Number,
      matched: Number,
      unexpectedSample: [Schema.Types.Mixed],
      sampleLimit: Number,
      totalUnexpected: Number,
      affectedRecords: {
        type: [{
          rowId: Number, // BR-DT-001, siempre presente
          businessId: { type: String, default: null }, // BR-DT-006, solo si aplica
        }],
        default: [],
      },
    }],
    default: [],
  },
}
```

## Pruebas unitarias requeridas (Jest + `mongodb-memory-server`)

`src/models/__tests__/ExpectationSuite.test.js`:
- Guarda una Suite válida con todos los campos requeridos — éxito.
- Falla si falta `projectId` o `name`.
- Default de `sampleLimit` es 20 si no se especifica.
- Default de `version` es 1 al crear.
- Default de `threshold` de una expectativa es 100 si no se especifica.
- Rechaza un `expId` fuera del enum (ej. `"EXP-DT-999"`).
- Rechaza un `scope` fuera del enum.
- Guarda correctamente una expectativa de cada `scope` (table/column/multicolumn) con su `params`
  correspondiente.

`src/models/__tests__/ValidationRun.test.js`:
- Guarda una Corrida válida con `results` y `columnCoverage` poblados — éxito.
- Falla si falta `suiteId`, `suiteSnapshotVersion` o `overallStatus`.
- Rechaza `overallStatus` fuera de `['passed', 'failed']`.
- Guarda correctamente un `affectedRecords` con `rowId` sin `businessId` (caso sin columna
  identificadora definida).
- Guarda correctamente un `affectedRecords` con `businessId` presente.

## Definición de Hecho

- [ ] Scaffold de `data-testing-service` creado, levanta con `pnpm --filter data-testing-service dev`.
- [ ] Ambos modelos creados con las validaciones descriptas.
- [ ] Todos los tests unitarios de esta etapa pasan (`pnpm --filter data-testing-service test`).
- [ ] `.env.example` del servicio documentado (Mongo URI, puerto, `JWT_SECRET` — debe coincidir con
  los otros 6 servicios).
- [ ] Sin rutas HTTP todavía (eso es Etapa 4 y 5).
