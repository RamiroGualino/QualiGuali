# Etapa 5 — API de Corridas de Validación

**Deriva de:** `etapa-0-especificacion-funcional.md` — REQ-DT-008 a 013, BR-DT-002, 003, 005.
**Depende de:** Etapas 1 a 4 completas.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/validation-runs` | Ejecuta una Corrida (ver flujo abajo) |
| `GET` | `/api/validation-runs?suiteId=` | Historial de Corridas de una Suite, ordenado por
  `executedAt` descendente |
| `GET` | `/api/validation-runs/:id` | Detalle completo de una Corrida (incluye `results[]` y
  `columnCoverage`) |

## Flujo de `POST /api/validation-runs`

Body (multipart): `suiteId`, archivo (`file`), `columnMappingOverrides` (JSON stringificado:
`[{expectedColumn, matchedColumn}]`, las correcciones manuales que hizo el usuario sobre la
sugerencia de `preview-match`), `saveMappingToSuite` (boolean).

1. Cargar la Suite por `suiteId`. Si no existe → 404.
2. Parsear el archivo subido con `spreadsheetParser` (Etapa 2) — `{ headers, records }` (records
   con `_rowId`).
3. Correr `matchColumns(suite.expectedColumns, headers)` (Etapa 2), después aplicar
   `columnMappingOverrides` encima del resultado automático (las correcciones manuales ganan
   sobre la sugerencia).
4. Armar `columnCoverage` a partir del mapeo final (BR-DT-003).
5. Tomar snapshot inmutable de `suite.expectations` (BR-DT-005) — `suiteSnapshot`,
   `suiteSnapshotVersion: suite.version`.
6. Correr `runEngine.run(records, suiteSnapshot, mapeoFinal, suite.sampleLimit,
   suite.businessIdColumn)` (Etapa 3) — `results[]`.
7. Calcular `overallStatus`: `'failed'` si algún resultado tiene `status: 'failed'`, sino
   `'passed'`.
8. Persistir el `ValidationRun` completo.
9. Si `saveMappingToSuite === true`: actualizar `suite.expectedColumns`/mapeo guardado con las
   correcciones manuales, para que la próxima Corrida las tome como sugerencia automática (REQ-DT-010)
   — **esto no incrementa `version`** de la Suite (no es un cambio de reglas, es un ajuste de
   nombres de columna).
10. Responder 201 con el `ValidationRun` creado.

## Pruebas unitarias requeridas (Jest + Supertest + `mongodb-memory-server`)

`src/routes/__tests__/validationRuns.test.js` — tests de integración end-to-end del flujo
completo, reusando fixtures de Etapa 2 y Suites de prueba de Etapa 4:

- Corrida completa con archivo que matchea 100% de las columnas esperadas — `overallStatus`
  correcto según si las expectativas pasan o no.
- Corrida con una columna esperada ausente en el archivo — aparece en `columnCoverage` con
  `found: false`, sus expectativas no están en `results[]` (BR-DT-003).
- Corrida con `columnMappingOverrides` — el mapeo manual prevalece sobre la sugerencia automática.
- Corrida con `saveMappingToSuite: true` — la Suite queda actualizada, sin cambiar `version`.
- Corrida con `saveMappingToSuite: false` (o ausente) — la Suite no cambia.
- Dos Corridas contra la misma Suite, editando la Suite entre medio — cada Corrida guarda su
  propio `suiteSnapshotVersion` distinto, y el resultado de la primera Corrida no cambia
  retroactivamente (BR-DT-005).
- `GET /api/validation-runs?suiteId=X` — orden descendente por fecha.
- `GET /api/validation-runs/:id` inexistente — 404.
- `suiteId` inexistente en `POST` — 404 antes de intentar parsear el archivo.

## Definición de Hecho

- [ ] Los 3 endpoints implementados con el flujo completo descripto.
- [ ] Todos los tests de esta etapa pasan.
- [ ] Con esto, el backend del módulo está funcionalmente completo — las etapas 6 a 9 son
  frontend/i18n, sin lógica de negocio nueva.
