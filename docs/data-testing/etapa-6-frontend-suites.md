# Etapa 6 — Frontend: Suites de Expectativas + selector de expectativas

**Deriva de:** `etapa-0-especificacion-funcional.md` — REQ-DT-001 a 007, sección 6 (catálogo,
inputs por expectativa), sección 8 (pantallas).
**Depende de:** Etapa 4 (API de Suites) desplegada y accesible.

## Reciclar de `apps/web/src/components` (sin crear de nuevo)

- `Table` + `useSearchAndPaginate` — listado de Suites.
- `Dropzone` — subida del archivo de referencia para detectar columnas.
- `Combobox` — selección de columna identificadora de negocio, y selección de columna en
  expectativas multicolumna.
- `Modal` — flujo de creación/edición.
- `StatusBadge` — estado de "última corrida" en el listado, si se muestra.

## Archivos nuevos

### `apps/web/src/api/dataTesting.api.js`

Cliente HTTP, mismo patrón que `defects.api.js`: `listSuites`, `getSuite`, `createSuite`,
`updateSuite`, `deleteSuite`, `detectColumns`, `previewMatch`, `listRuns`, `getRun`, `createRun`
(estas dos últimas se usan recién en Etapa 7, pero conviene definirlas todas juntas acá).

### `apps/web/src/pages/DataTesting/SuitesListPage.jsx` (+ `.module.css`)

Listado de Suites del proyecto activo. Reusa `Table`/`useSearchAndPaginate`. Acción "Nueva Suite"
lleva al formulario.

### `apps/web/src/pages/DataTesting/SuiteFormPage.jsx` (+ `.module.css`)

Crear/editar. Flujo:
1. Nombre, descripción.
2. `Dropzone` para archivo de referencia — llama `detectColumns` — puebla la lista de columnas
   disponibles para el selector de expectativas.
3. `Combobox` opcional para elegir columna identificadora de negocio (REQ-DT-007).
4. Selector de expectativas (componente nuevo, ver abajo).
5. Input numérico para `sampleLimit` (default 20).
6. Guardar — `createSuite`/`updateSuite`.

### `apps/web/src/components/ExpectationSelector/` (ÚNICO componente genuinamente nuevo)

Es la pieza central diseñada a lo largo de toda la conversación de análisis. Estructura:

- 3 pestañas: **Tabla**, **Columna**, **Multicolumna** (etapa-0 secciones 6.1, 6.2, 6.3).
- Pestaña Columna: primero se elige la columna (de las detectadas en el paso 2 del form), después
  el tipo de expectativa en un `<select>` agrupado por `<optgroup>` (Ausencia/Tipo, Rango/Set,
  Texto, Estadística — etapa-0 sección 6.2).
- Al elegir un tipo, se renderizan los inputs correspondientes **dinámicamente** — la tabla de la
  etapa-0 sección 6 (columna "Input(s) en el formulario") es literalmente la tabla de verdad para
  esta lógica: cada `expId` sabe qué inputs mostrar.
- Pestaña Multicolumna: selección de 2+ columnas vía `Combobox` múltiple, en vez de 1.
- Cada expectativa agregada se muestra como una "pastilla" removible en una lista, agrupada por
  columna (o suelta, para las de nivel Tabla).
- Expectativas de nivel Columna/Multicolumna llevan además un input de **Umbral (%)**, default
  100 (BR-DT-004). Las de nivel Tabla no.
- El componente expone su estado como un array de objetos `{ expId, scope, column|columns, params,
  threshold? }` — exactamente el shape que espera el modelo `ExpectationSuite.expectations`
  (Etapa 1), para que `SuiteFormPage` lo mande directo al `createSuite`/`updateSuite` sin
  transformación.

## Pruebas unitarias requeridas (Vitest + Testing Library)

`src/components/ExpectationSelector/__tests__/ExpectationSelector.test.jsx`:
- Elegir "Entre X e Y" en el dropdown de Columna — aparecen 2 inputs numéricos (min, max).
- Elegir "En el conjunto" — aparece 1 input de texto.
- Elegir "No nulo" — no aparece ningún input adicional.
- Elegir "Parseable como fecha" — no aparece ningún input adicional.
- Cambiar de tipo de expectativa sin haber agregado la anterior — los inputs se reemplazan, no se
  acumulan.
- Agregar una expectativa — aparece como pastilla en la lista, con su `expId` correcto.
- Quitar una pastilla — desaparece de la lista y del estado expuesto.
- Pestaña Tabla: agregar "Columnas = lista exacta, en orden" — input de tipo lista, sin campo de
  Umbral (las de nivel Tabla no llevan umbral).
- Pestaña Multicolumna: "Columna A > Columna B" — selects A y B habilitados, checkbox "o igual"
  presente.
- El array de estado expuesto al agregar 2 expectativas tiene el shape exacto que espera
  `ExpectationSuite.expectations` (Etapa 1) — test de contrato entre componentes.

`src/pages/DataTesting/__tests__/SuiteFormPage.test.jsx`:
- Subir archivo de referencia (mock de `detectColumns`) — las columnas detectadas aparecen
  disponibles en `ExpectationSelector`.
- Guardar con al menos 1 expectativa — llama `createSuite` con el payload correcto.

## Definición de Hecho

- [ ] `ExpectationSelector` soporta las 35 expectativas del catálogo con sus inputs dinámicos
  correctos (etapa-0 sección 6, columna "Input(s)").
- [ ] `SuitesListPage` y `SuiteFormPage` funcionando contra la API real (Etapa 4).
- [ ] Todos los tests de esta etapa pasan.
- [ ] Ningún componente usa librería de UI externa ni Tailwind — CSS Modules puro, consistente con
  el resto de `apps/web`.
