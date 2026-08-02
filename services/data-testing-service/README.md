# data-testing-service

Servicio de Test de Datos de QualiGuali (`docs/data-testing/`). Se conecta a la base MongoDB
compartida `qualiguali` (AD-002) y solo lee/escribe sus propias colecciones:
`data_testing_expectationSuites` y `data_testing_validationRuns`.

## Estado actual: módulo completo (Etapas 0-11)

**Etapa 11 (`docs/data-testing/etapa-11-rediseno-reporte-ejecucion.md`):** rediseño enterprise,
puramente frontend, del detalle de Corrida (`ExpectationRunDetailPage.jsx`) — mismos datos que
`GET /validation-runs/:id` siempre devolvió, sin ningún campo nuevo del backend. Dashboard
ejecutivo (veredicto + Data Quality Score, gauge SVG propio, derivado en el frontend + gráficos
`recharts`), Cobertura de Columnas como lista compacta en vez de tabla, y Resultado por
Expectativa como una card por regla (nombre en lenguaje de negocio, badge, barra de % de éxito,
impacto, panel "Ver detalle" colapsado por default con la muestra de fallos Registro/Valor/Motivo
o la comparación Esperado/Obtenido según el scope) más un resumen final con checklist y veredicto.
El PDF (Etapa 8) no se tocó. Nuevos: 9 componentes (`RunExecutiveSummary`, `DataQualityScoreCard`,
`RunQualityCharts`, `RuleResultCard`, `FailureSampleTable`, `ExpectedVsActualComparison`,
`ImpactIndicator`, `ColumnCoverageCard`, `RunFinalVerdict`) + 6 utils puros y testeados
(`expectationCatalog`, `resultSuccessPercent`, `dataQualityScore`, `resultImpact`,
`runQualityMetrics`, `formatDuration`).

Etapa 10 agrega `apps/web/e2e/data-testing.spec.js` — E2E Playwright contra el stack real,
cubriendo el flujo de punta a punta (login, Suite con los 3 scopes de expectativas, Corrida con
matching fuzzy y una falla a propósito, PDF, historial). Ver
`docs/data-testing/etapa-10-e2e-playwright.md` — incluye un bug real encontrado y arreglado ahí
mismo (`ExpectationRunsPage.jsx` navegaba dos veces al hacer click en "View", rompiendo el botón
"Volver" del detalle de Corrida).

**Post-Etapa 10 (mejora de UX pedida directamente):** `POST /suites/detect-columns` ahora también
devuelve `rowCount` (cantidad de filas de datos del archivo de referencia, sin contar el header) —
usado por `ExpectationSelector` para precargar el valor real al elegir una expectativa de nivel
Tabla: "Row count = X" con el `rowCount` real, "Column count = X" con la cantidad de columnas
detectadas, y "Columns = exact/set list" con la lista de columnas en el orden detectado. El valor
sigue siendo editable, sólo cambia el punto de partida.

**Etapa 6.1 (`docs/data-testing/etapa-6.1-Rediseño UX.md`):** rediseño completo, puramente
frontend (sin cambios de modelo ni de API), de la pantalla Crear/Editar Suite — franja de
metadata compacta, dropzone que colapsa a una barra tras detectar columnas, pastillas de columnas
detectadas clickeables (con contador de expectativas por columna, saltan directo a configurarla),
panel de alta/edición fijo a la izquierda + lista agrupada (por columna, más Tabla/Multicolumna
fijos) con scroll propio a la derecha, cada expectativa mostrando su valor real interpolado (no
el label genérico) y editable en el lugar, previsualización en lenguaje natural en vivo, campos de
lista de valores como Tag Input. Nuevos: `TagInput.jsx`, `ExpectationList.jsx`,
`utils/expectationText.js` (formateador compartido entre la preview y la lista).

**Etapa 6.2 (`docs/data-testing/etapa-6.2-selector-por-tipo-de-dato.md`):** `ExpectationSuite.expectedColumns`
pasó de `[String]` a `[{ name, tipoDato: 'numero'|'texto'|'fecha'|'sin_definir' }]` — el tipo lo
define el usuario a mano (selector, sin heurística/inferencia), usado en `ExpectationSelector`
para filtrar qué expectativas de Columna tiene sentido ofrecer (25 → ~10-17 según el tipo), con un
link "Ver todas las expectativas" que saltea el filtro sin restricción dura. `sin_definir`
(default) muestra el catálogo completo, sin filtrar. Es el único cambio de esta etapa que tocó el
backend — `validateExpectations`/`businessIdColumn`/`matchColumns`/`applyMappingCorrectionsToSuite`
ahora comparan por `.name` en vez de contra el string directo.

Con esta etapa el backend del módulo está funcionalmente completo (`/suites` + `/validation-runs`
— las etapas 6-9 son frontend/i18n, sin lógica de negocio nueva). Base: los dos modelos Mongoose
(Etapa 1), el parseo de archivos + matching de columnas (Etapa 2), y el motor de evaluación
(Etapa 3):

- **`src/utils/spreadsheetParser.js`** — parsea un buffer de Excel (`.xlsx`), CSV o ODS y devuelve
  `{ headers, records }`, cada `record` con `_rowId` secuencial (BR-DT-001). CSV se decodifica
  explícitamente como UTF-8 antes de pasarlo a SheetJS — pasarlo como `Buffer` directo rompía
  acentos/ñ (`XLSX.read` adivina mal el encoding para texto plano).
- **`src/utils/columnMatching.js`** — `normalizeColumnName` (minúsculas, sin tildes, sin
  puntuación, sin espacios repetidos) y `matchColumns` (Levenshtein propio, sin dependencia
  externa) para el auto-matching de columnas (BR-DT-002).
- **`src/engine/`** — las 35 funciones evaluadoras del catálogo (`EXP-DT-001` a `EXP-DT-035`),
  separadas por nivel (`tableExpectations.js`, `columnExpectations.js`,
  `multicolumnExpectations.js`), un `registry.js` que las mapea por `expId`, y `runEngine.js` que
  orquesta una corrida completa respetando BR-DT-003 (una columna esperada no encontrada — o,
  para multicolumna, cualquiera de sus columnas — salta esa Expectativa sin marcarla pasada ni
  fallada). `helpers.js` tiene la lógica compartida: `tallyRecords` (evaluación fila por fila, con
  threshold/muestra/`affectedRecords`) para las expectativas de presencia/formato/rango, y
  `buildAggregateResult` para las 9 estadísticas (media, suma, etc.), que son un único valor
  calculado sobre toda la columna, no un pass/fail por fila.

**Nota sobre el modelo (Etapa 1) ajustada acá**: `ValidationRun.results[]` no tenía dónde guardar
el `expected`/`actual` de las Expectativas de nivel Tabla (esas no devuelven `successPercent`, son
estructurales) ni `columns[]` para las de nivel Multicolumna (que no tienen una sola `column`) —
se agregaron esos tres campos opcionales al schema.

## Endpoints (Etapa 4)

Sin prefijo `/api/` — mismo criterio que el resto del monorepo (`/defects`, `/postman-suites`,
etc.). Sólo requiere JWT válido (`createAuthenticate`), sin `requireRole` — mismo criterio que
`defects-service`/`execution-service`/`qa-core-service` (ver nota de permisos en
`docs/data-testing/etapa-4-api-suites.md`).

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/suites` | Crea una Suite. Valida `projectId` contra `projects-service`, y cada expectativa (`expId` del catálogo, `column`/`columns` presente y dentro de `expectedColumns` según `scope`). |
| `GET` | `/suites?projectId=` | Lista Suites de un proyecto. |
| `GET` | `/suites/:id` | Detalle de una Suite. |
| `PATCH` | `/suites/:id` | Edita (parcial) una Suite — **incrementa `version` en 1** (BR-DT-005). |
| `DELETE` | `/suites/:id` | Elimina una Suite, sin cascada a `ValidationRun`. |
| `POST` | `/suites/detect-columns` | Multipart (`file`): parsea un archivo de referencia y devuelve `{ headers, rowCount }`, sin persistir nada. |
| `POST` | `/suites/:id/preview-match` | Multipart (`file`): corre `matchColumns` contra el `expectedColumns` de esa Suite, devuelve `{ matches, headers }` (`headers` agregado en Etapa 7, para poder ofrecer una columna real del archivo en una corrección manual). |

## Endpoints (Etapa 5, `?projectId=` agregado en Etapa 7)

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/validation-runs` | Ejecuta una Corrida completa: parsea el archivo, matchea columnas (+ `columnMappingOverrides` manuales encima), toma un snapshot inmutable de las Expectativas (BR-DT-005), corre el motor (Etapa 3), persiste. |
| `GET` | `/validation-runs?suiteId=&projectId=` | Historial de Corridas, más recientes primero. Ambos filtros opcionales y combinables — `?projectId=` no existía hasta Etapa 7 (el listado de Corridas del frontend lo necesitaba y `ValidationRun.projectId` ya estaba en el modelo, indexado, solo no expuesto). |
| `GET` | `/validation-runs/:id` | Detalle completo (`results[]`, `columnCoverage`). |

`POST /validation-runs` es multipart: `suiteId`, `file`, `columnMappingOverrides` (JSON
stringificado, opcional), `saveMappingToSuite` (`"true"`, opcional). **REQ-DT-010** ("guardar
esta corrección en la Suite"), en términos del schema real: renombra la entrada de
`expectedColumns` (y cualquier `expectations[].column`/`columns`/`businessIdColumn` que
apuntara a ella) al nombre real que el usuario confirmó — así la próxima Corrida matchea
`exact` en vez de volver a pedir corrección manual. No incrementa `version` (no es un cambio de
reglas).

## Modelos

- **`ExpectationSuite`** — una colección reutilizable de Expectativas de calidad sobre columnas de
  un archivo de datos (Excel/CSV/ODS), asociada a un Proyecto. Versionada: cada edición incrementa
  `version` (BR-DT-005).
- **`ValidationRun`** — el resultado de aplicar una `ExpectationSuite` a un archivo subido en el
  momento. Guarda un snapshot inmutable de las Expectativas tal como estaban al ejecutarse
  (`suiteSnapshot`/`suiteSnapshotVersion`), para que editar la Suite después no altere corridas
  pasadas.

Catálogo completo de las 35 Expectativas soportadas (`EXP-DT-001` a `EXP-DT-035`) en
`docs/data-testing/etapa-0-especificacion-funcional.md`, sección 6.

## Correr en local

```bash
# desde la raíz del monorepo
pnpm install

cd services/data-testing-service
cp .env.example .env   # completar JWT_SECRET (mismo valor que los demás servicios)

pnpm dev
```

## Variables de entorno

| Variable               | Requerida | Default                                | Descripción                                                              |
| ----------------------- | --------- | -------------------------------------- | -------------------------------------------------------------------------- |
| `PORT`                  | No        | `4006`                                 | Puerto HTTP del servicio.                                                  |
| `NODE_ENV`              | No        | `development`                          | Entorno de ejecución.                                                      |
| `MONGODB_URI`           | No        | `mongodb://localhost:27017/qualiguali` | URI de la base compartida (misma para todos los servicios, AD-002).        |
| `JWT_SECRET`            | **Sí**    | —                                       | Debe coincidir con el de los demás servicios.                              |
| `PROJECTS_SERVICE_URL`  | No        | `http://localhost:4001`                | Base URL de `projects-service` para validar `projectId` al crear una Suite. |

## Tests

```bash
cd services/data-testing-service
pnpm test
```

- **Etapa 1**: validación de schema de ambos modelos contra `mongodb-memory-server`.
- **Etapa 2**: `spreadsheetParser` (fixtures reales `.xlsx`/`.csv`/`.ods` en
  `tests/__fixtures__/spreadsheets/`, regenerables con
  `node tests/__fixtures__/spreadsheets/generate.js`) y `columnMatching` (normalización,
  exact/fuzzy/not_found, smoke test de performance con 20+ columnas).
- **Etapa 3**: al menos un caso pass + uno fail por cada uno de los 35 `expId`
  (`tableExpectations.test.js`, `columnExpectations.test.js`, `multicolumnExpectations.test.js`),
  más threshold/`sampleLimit`/`businessIdColumn` y `runEngine.test.js` (BR-DT-003, `overallStatus`).
- **Etapa 4**: `tests/integration/suites.test.js` — CRUD completo, validaciones de negocio (400 por
  `expId` inválido/`column` faltante o fuera de `expectedColumns`/`businessIdColumn` fuera de
  `expectedColumns`/proyecto inexistente), `version` incrementando en `PATCH`, `detect-columns` y
  `preview-match` contra fixtures reales, 401 sin token.
- **Etapa 5**: `tests/integration/validationRuns.test.js` — corrida completa (passed/failed real),
  BR-DT-003 (columna ausente sin entrada en `results[]`), `columnMappingOverrides` ganando sobre
  la sugerencia automática, `saveMappingToSuite` (con y sin guardar), BR-DT-005 (dos corridas con
  la Suite editada entre medio, cada una con su propio `suiteSnapshotVersion`, la primera sin
  cambiar retroactivamente), 404 antes de parsear el archivo si `suiteId` no existe.

142 tests en total. Verificado también a mano contra el stack real (`projects-service` corriendo
de verdad, no mockeado): crear Suite, `detect-columns`, `preview-match`, `PATCH`, `DELETE`, y una
Corrida completa contra un `.xlsx` real — ahí se encontró y corrigió un bug real: `results[].threshold`
quedaba siempre `null` (el evaluador nunca lo devolvía, `runEngine.js` no lo completaba).

## Frontend (Etapa 6 — Suites; Etapa 7 — Corridas; Etapa 8 — PDF)

`apps/web/src/pages/ExpectationSuitesPage.jsx` + `ExpectationSuiteFormPage.jsx` (Etapa 6);
`ExpectationRunsPage.jsx` + `ExpectationRunDetailPage.jsx` y el componente
`ValidationRunNewModal.jsx` (Etapa 7, wizard de 2 pasos para lanzar una Corrida: elegir Suite +
subir archivo, confirmar el mapeo de columnas color-codeado por `matchType`, ejecutar). Todo plano
en `src/pages/`/`src/components/`, sin subcarpeta `DataTesting/` (convención del resto del repo).
Rutas y entrada de navegación quedan para la Etapa 9 — por ahora estas páginas no están enlazadas
desde ningún lado del router.

`apps/web/src/utils/dataTestReportPdf.js` (Etapa 8) — PDF nativo (texto + tablas, no screenshot
del DOM) de una Corrida: encabezado con semáforo verde/rojo según `overallStatus`, bloque
Cobertura de Columnas, bloque Resultado por Expectativa agrupado por columna (nivel Tabla
primero, después en el orden de `columnCoverage`, multicolumna al final). Reusa `safeText` de
`reportPdf.js` (el archivo hermano de Postman/Ciclos) para sanitizar cualquier string con datos
externos antes de dibujarlo — mismo criterio, sin motor de templates. El botón "Descargar PDF"
del detalle de Corrida ya llama a esto de verdad (`ExpectationRunDetailPage.jsx` resuelve el
nombre de la Suite con un `GET /suites/:id` aparte, ya que `ValidationRun` sólo guarda
`suiteId`).

## Navegación e i18n (Etapa 9)

Las 5 rutas quedaron conectadas en `apps/web/src/router.jsx`, todas project-scoped bajo
`/projects/:projectId/data-testing/...` (nunca a nivel raíz), y el módulo tiene su propia entrada
en `Sidebar.jsx` (`navItems`, gateada por `projectId` como `automation`/`defects`/`reports`).
`ExpectationSuitesPage`/`ExpectationRunsPage` comparten una barra de `Tabs` (Suites/Corridas),
mismo patrón que `AutomationPage`/`PostmanSuitesPage`. Con esto el módulo "Test de Datos" queda
completo de punta a punta: Etapas 1-5 backend, 6-7 frontend funcional, 8 PDF, 9 navegación.
