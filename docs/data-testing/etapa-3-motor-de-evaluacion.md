# Etapa 3 — Motor de evaluación de Expectativas

**Deriva de:** `etapa-0-especificacion-funcional.md` — sección 6 (catálogo completo, EXP-DT-001 a
EXP-DT-035), BR-DT-003, BR-DT-004.
**Depende de:** Etapa 1 (shape de `results` en `ValidationRun`), Etapa 2 (`records` con `_rowId`).

## Objetivo

Por cada `expId` del catálogo, una función pura: recibe los `records` parseados (Etapa 2) + los
`params`/`threshold` de la expectativa (definidos en la Suite, Etapa 1) y devuelve el resultado
con la forma exacta del sub-documento `results[]` de `ValidationRun` (ver Etapa 1).

## Archivos a crear

`services/data-testing-service/src/engine/`
- `tableExpectations.js` — EXP-DT-001 a 006
- `columnExpectations.js` — EXP-DT-007 a 031
- `multicolumnExpectations.js` — EXP-DT-032 a 035
- `registry.js` — mapa `{ [expId]: evaluatorFn }`, usado por Etapa 5 para despachar
- `runEngine.js` — orquesta: recorre las expectativas de un snapshot de Suite, invoca el
  evaluator correspondiente vía `registry`, arma `columnCoverage` (BR-DT-003: si la columna no
  está mapeada, sus expectativas de ese `column` se **saltean**, no se evalúan) y `results[]`.

## Contrato de cada evaluador de nivel Columna/Multicolumna

```js
/**
 * @param {Array<Object>} records - filas parseadas, cada una con _rowId
 * @param {string} column - nombre real de la columna (ya mapeada)
 * @param {Object} params - shape según expId (ver etapa-0 sección 6, columna "Input(s)")
 * @param {number} threshold - % mínimo de cumplimiento (BR-DT-004, default 100)
 * @param {number} sampleLimit - límite de la muestra de fallos (REQ-DT-006)
 * @param {string|null} businessIdColumn - nombre de columna identificadora, si la Suite la definió
 * @returns {{
 *   status: 'passed'|'failed', successPercent: number, evaluated: number, matched: number,
 *   unexpectedSample: any[], totalUnexpected: number,
 *   affectedRecords: Array<{rowId: number, businessId: string|null}>
 * }}
 */
```

Los evaluadores de nivel Tabla no devuelven `%`/muestra — son estructurales, devuelven
`{ status: 'passed'|'failed', expected: ..., actual: ... }` (ver etapa-0 sección 6.1 y 6.4).

Los evaluadores multicolumna reciben `columns: string[]` en vez de `column: string`, mismo shape
de retorno que los de columna.

## Reglas de implementación importantes

- **BR-DT-003**: `runEngine.js` nunca invoca un evaluador de columna si esa columna no se
  encontró en el mapeo — el resultado de esa expectativa simplemente no aparece en `results[]`
  para esa corrida. La ausencia se refleja solo en `columnCoverage`.
- **Muestra de fallos**: `unexpectedSample` y `affectedRecords` se truncan a `sampleLimit`, pero
  `totalUnexpected` siempre refleja el conteo real (no el truncado) — así el reporte puede decir
  "50 registros no conformes, mostrando 20".
- **`businessId` en `affectedRecords`**: se agrega solo si `businessIdColumn` está definida en la
  Suite Y el valor de esa columna en esa fila puntual no está vacío (BR-DT-006) — si está vacío,
  el objeto lleva `businessId: null`, nunca se omite el campo.

## Pruebas unitarias requeridas (Jest)

Mínimo **un test por cada uno de los 35 `expId`**, cada uno con un dataset chico de records
(5–10 filas) diseñado para tener casos que pasan y casos que fallan a propósito. Ejemplos
representativos (no exhaustivo, aplicar el mismo patrón a los 35):

- `EXP-DT-007` (no nulo): dataset con 2 de 10 valores nulos — `successPercent: 80`,
  `affectedRecords` con los 2 `rowId` correspondientes.
- `EXP-DT-012` (entre X e Y): valores fuera de rango cuentan como no conformes.
- `EXP-DT-017` (regex): valores que no matchean el patrón aparecen en `unexpectedSample`.
- `EXP-DT-025` (media entre X e Y): calcula la media real del dataset y compara contra el rango.
- `EXP-DT-032` (A > B): dataset con filas donde A <= B cuentan como no conformes, con `rowId`
  correcto en `affectedRecords`.
- Umbral (`threshold`): mismo dataset con `threshold: 70` vs `threshold: 100` — cambia el
  `status` aunque el `successPercent` sea igual.
- `sampleLimit`: dataset con 50 fallos y `sampleLimit: 20` — `unexpectedSample.length === 20`,
  `totalUnexpected === 50`.
- `businessIdColumn` definida, fila fallida sin valor en esa columna — `businessId: null`, no
  se omite el campo.

`src/engine/__tests__/runEngine.test.js`:
- Columna esperada no mapeada — sus expectativas no aparecen en `results[]`, sí aparece
  `found: false` en `columnCoverage`.
- Corrida con todas las expectativas pasando — `overallStatus: 'passed'` a nivel `ValidationRun`.
- Corrida con al menos una expectativa fallando — `overallStatus: 'failed'`.

## Definición de Hecho

- [ ] Las 35 funciones evaluadoras implementadas y registradas en `registry.js`.
- [ ] `runEngine.js` orquesta correctamente respetando BR-DT-003.
- [ ] Cobertura de tests: al menos 1 caso pass + 1 caso fail por cada uno de los 35 `expId`.
- [ ] Todos los tests de esta etapa pasan.
