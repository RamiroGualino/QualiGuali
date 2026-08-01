# Etapa 2 — Parseo de archivos y matching de columnas

**Deriva de:** `etapa-0-especificacion-funcional.md` — BR-DT-001, BR-DT-002.
**Depende de:** Etapa 1 (modelos ya existentes, no se tocan acá).

## Nota de arquitectura importante

En la conversación de diseño se había hablado de reusar `apps/web/src/utils/spreadsheet.js`
(que corre en el browser, parte del Transformador de Excel). **Eso no aplica acá**: el archivo se
sube al backend nuevo (`data-testing-service`) vía `multer`, igual que ya hacen
`execution-service` y `defects-service` con evidencia — así que el parseo tiene que correr
server-side, en Node. No es tecnología nueva: `xlsx` (SheetJS) tiene build para Node y para
browser bajo el mismo paquete npm, así que es la misma librería que ya usa `apps/web`, solo que
ejecutada del lado del servicio. No hay reciclaje de código literal posible acá (contextos de
ejecución distintos), pero sí de patrón y de librería.

## Archivos a crear

### `services/data-testing-service/src/utils/spreadsheetParser.js`

```js
/**
 * Parsea un buffer de Excel/CSV/ODS y devuelve { headers, records }.
 * Cada record incluye un campo interno `_rowId` (número de fila, 1-indexed,
 * sin contar el header) — nunca se expone como columna de datos real.
 */
function parseSpreadsheetBuffer(buffer, filename) { /* usa xlsx (SheetJS) */ }

module.exports = { parseSpreadsheetBuffer };
```

- Dependencia nueva: `xlsx` en `package.json` del servicio (npm `xlsx`, mismo paquete que ya usa
  `apps/web`).
- `multer` en memoria (no disco) para recibir el archivo — mismo patrón que
  `execution-service`/`defects-service`.
- `_rowId` se asigna en el momento del parseo, secuencial, empieza en 1.

### `services/data-testing-service/src/utils/columnMatching.js`

```js
/** Normaliza: minúsculas, sin tildes, trim, colapsa espacios múltiples. */
function normalizeColumnName(name) { /* ... */ }

/**
 * Compara columnas esperadas (de la Suite) contra las columnas reales del archivo.
 * Devuelve: [{ expectedColumn, matchedColumn, matchType, confidence }]
 * matchType: 'exact' (igual tras normalizar) | 'fuzzy' (similar, requiere confirmación)
 *            | 'not_found' (sin coincidencia, requiere asignación manual)
 * Fuzzy: distancia de Levenshtein normalizada, umbral configurable (default: similitud >= 0.75).
 */
function matchColumns(expectedColumns, actualColumns) { /* ... */ }

module.exports = { normalizeColumnName, matchColumns };
```

- Implementar Levenshtein como función pura sin dependencia externa (es chico, no amerita paquete
  nuevo).
- `matchColumns` NO decide nada por su cuenta más allá de sugerir — la decisión final (confirmar
  sugerencia / corregir a mano / marcar "no está en este archivo") es responsabilidad del cliente
  (frontend, Etapa 6/7) o del payload de corrección manual que llega en la Etapa 5.

## Pruebas unitarias requeridas (Jest)

`src/utils/__tests__/spreadsheetParser.test.js`:
- Parsea un `.xlsx` de prueba (fixture chico en `__fixtures__/`) — headers correctos, cantidad de
  records correcta.
- Cada record tiene `_rowId` secuencial empezando en 1.
- Parsea `.csv` y `.ods` con el mismo resultado estructural.
- Archivo vacío (solo headers, sin filas) — `records: []`, sin error.

`src/utils/__tests__/columnMatching.test.js`:
- `normalizeColumnName`: `"Fecha de Nacimiento"` y `"fecha   de nacimiento"` normalizan igual;
  `"Núm. Afiliado"` y `"Num Afiliado"` normalizan igual (sin tildes).
- `matchColumns`: match exacto tras normalizar — `matchType: 'exact'`.
- `matchColumns`: `"Fecha Nacimiento"` esperada vs `"Fecha de Nacimiento"` real — `matchType: 'fuzzy'`.
- `matchColumns`: columna esperada sin ninguna columna real parecida — `matchType: 'not_found'`.
- `matchColumns`: con 20+ columnas esperadas, corre sin degradar (test de performance liviano, no
  crítico pero sirve de smoke test).

## Definición de Hecho

- [ ] Ambos módulos creados y exportados.
- [ ] Fixtures de prueba (`.xlsx`, `.csv`, `.ods` chicos) agregados a `__fixtures__/`.
- [ ] Todos los tests de esta etapa pasan.
- [ ] Sin endpoints HTTP todavía (eso es Etapa 4 y 5) — son funciones puras, testeadas de forma
  aislada.
