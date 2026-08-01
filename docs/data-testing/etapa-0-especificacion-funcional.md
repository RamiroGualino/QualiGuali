# Documento 1.2 (extensión) — SRS & Reglas de Negocio
## Módulo: Test de Datos

*Elaborado por: Business Analyst*
*Deriva de: Análisis funcional original (roles, proyectos) — no modifica alcance existente, agrega módulo nuevo.*

---

## 1. Objetivo

Permitir a un QA Engineer (o Admin) definir reglas de calidad reutilizables sobre archivos de
datos (Excel/CSV/ODS) — de cualquier dominio, no solo casos de prueba — y ejecutar validaciones
recurrentes contra esas reglas, con historial y reporte detallado por corrida.

## 2. Alcance v1

- Módulo nuevo e independiente en el sidebar: **Test de Datos**, dentro de un Proyecto.
- Origen del dato: archivo subido en el momento (Excel `.xlsx`/`.xls`, CSV, ODS vía SheetJS).
- Ejecución manual, sin programación ni alertas automáticas.
- Sin conexión a bases de datos externas ni Google Sheets.

## 3. Glosario del módulo

| Término | Definición |
| --- | --- |
| Expectativa | Regla individual de calidad sobre una columna, la tabla completa, o una relación entre columnas. |
| Suite de Expectativas | Colección Mongo reutilizable de Expectativas, versionada por snapshot en cada corrida. |
| Corrida de Validación | Acción manual: aplica una Suite a un archivo subido, guarda el resultado. Sin alertas automáticas. |
| Cobertura de Columnas | Bloque del resultado que indica, por columna esperada, si se encontró o no en el archivo (estructural, no porcentual). |
| Resultado por Expectativa | Bloque del resultado con métrica cuantitativa (% de filas que cumplieron, sobre las columnas que sí se encontraron). |
| Umbral (`mostly`) | % mínimo de cumplimiento para que una Expectativa cuente como pasada. Default 100%. |
| `_rowId` | Identificador secuencial interno, asignado al parsear el archivo, no visible como dato de negocio. Garantiza trazabilidad de fila aunque el dato de negocio esté vacío. |

## 4. Requisitos Funcionales

- **REQ-DT-001**: El sistema debe permitir crear, editar, listar y eliminar Suites de
  Expectativas dentro de un Proyecto.
- **REQ-DT-002**: Al crear/editar una Suite, el usuario sube un archivo de referencia (o ingresa
  nombres de columna a mano) para poblar el selector de columnas disponibles.
- **REQ-DT-003**: El selector de Expectativas debe organizarse en 3 categorías: Tabla, Columna,
  Multicolumna (catálogo completo en sección 6). Cada expectativa del catálogo tiene un ID único
  (`EXP-DT-001` a `EXP-DT-035`) que se persiste junto con la Expectativa dentro de la Suite y en
  el resultado de cada Corrida, para trazabilidad.
- **REQ-DT-004**: Cada Expectativa de tipo "entre X e Y", "en el conjunto", "coincide con regex",
  etc. debe mostrar dinámicamente los inputs correspondientes según el tipo elegido.
- **REQ-DT-005**: Cada Expectativa de columna admite un Umbral opcional (default 100%).
- **REQ-DT-006**: Una Suite admite un límite configurable de "muestra de fallos" por Expectativa
  (default 20 registros).
- **REQ-DT-007**: Una Suite admite designar opcionalmente una columna identificadora de negocio
  (ej. DNI) para enriquecer, no reemplazar, el `_rowId`.
- **REQ-DT-008**: El sistema debe permitir iniciar una Corrida de Validación: elegir Suite + subir
  archivo a validar.
- **REQ-DT-009**: Al iniciar una Corrida, el sistema debe intentar emparejar automáticamente las
  columnas del archivo contra las columnas esperadas por la Suite (algoritmo en BR-DT-002),
  mostrando el resultado del match para confirmación o corrección manual antes de ejecutar.
- **REQ-DT-010**: El usuario puede, al corregir un mapeo de columna manualmente, optar por guardar
  esa corrección en la Suite para corridas futuras.
- **REQ-DT-011**: El resultado de una Corrida debe mostrarse separado en dos bloques: Cobertura de
  Columnas y Resultado por Expectativa (sección 7).
- **REQ-DT-012**: El sistema debe listar el historial de Corridas por Suite.
- **REQ-DT-013**: El sistema debe permitir descargar el resultado de una Corrida como PDF.

## 5. Reglas de Negocio

- **BR-DT-001**: Cada fila de un archivo procesado recibe un `_rowId` secuencial al momento del
  parseo. Nunca se muestra como columna de datos.
- **BR-DT-002**: El matching de columnas normaliza antes de comparar (minúsculas, sin tildes, sin
  espacios repetidos/al borde). Match exacto tras normalizar → auto-asignado. Match aproximado →
  sugerido, requiere confirmación. Sin coincidencia → asignación manual obligatoria o marcar
  "no está en este archivo".
- **BR-DT-003**: Si una columna esperada por la Suite no se encuentra en el archivo de una Corrida,
  se registra como `found: false` en Cobertura de Columnas. Sus Expectativas **no se evalúan** en
  esa Corrida (no cuentan como falladas ni pasadas — no hay filas sobre las cuales calcular un %).
- **BR-DT-004**: El Umbral default de toda Expectativa es 100% salvo que el usuario lo configure
  distinto.
- **BR-DT-005**: Cada Corrida guarda un snapshot inmutable de las Expectativas de la Suite tal
  como estaban en el momento de ejecutarse. Editar la Suite después no altera corridas pasadas.
- **BR-DT-006**: "Registros Afectados" en el resultado de una Expectativa muestra `_rowId` siempre;
  si la Suite definió columna identificadora de negocio y la fila afectada tiene ese dato cargado,
  se agrega como enriquecimiento (`Fila 405 — DNI: 30123456`).

## 6. Catálogo de Expectativas — detalle completo

El catálogo es completo desde v1 (no hay subset curado): no se conoce de antemano qué tipo de
datos va a traer cada archivo, así que las ~30 expectativas del catálogo original están todas
disponibles desde el primer momento.

### 6.1 Nivel Tabla

| ID | Expectativa | Equivalente GX | Input(s) en el formulario |
| --- | --- | --- | --- |
| EXP-DT-001 | Cantidad de filas = X | `expect_table_row_count_to_equal` | 1 número entero |
| EXP-DT-002 | Cantidad de filas entre X e Y | `expect_table_row_count_to_be_between` | 2 números enteros (mín, máx) |
| EXP-DT-003 | Cantidad de columnas = X | `expect_table_column_count_to_equal` | 1 número entero |
| EXP-DT-004 | Cantidad de columnas entre X e Y | `expect_table_column_count_to_be_between` | 2 números enteros (mín, máx) |
| EXP-DT-005 | Columnas = lista exacta, en orden | `expect_table_columns_to_match_ordered_list` | Lista de nombres de columna, ordenada |
| EXP-DT-006 | Columnas = conjunto, sin importar orden | `expect_table_columns_to_match_set` | Lista de nombres de columna, sin orden |

### 6.2 Nivel Columna

Se elige la columna primero; el dropdown de tipo de expectativa está agrupado por sub-categoría
(`<optgroup>`: Ausencia/Tipo, Rango/Set, Texto, Estadística) para no mostrar 20 opciones en una
lista plana.

| ID | Grupo | Expectativa | Equivalente GX | Input(s) en el formulario |
| --- | --- | --- | --- | --- |
| EXP-DT-007 | Ausencia/Tipo | No nulo | `expect_column_values_to_not_be_null` | — |
| EXP-DT-008 | Ausencia/Tipo | Debe ser nulo | `expect_column_values_to_be_null` | — |
| EXP-DT-009 | Ausencia/Tipo | Único | `expect_column_values_to_be_unique` | — |
| EXP-DT-010 | Ausencia/Tipo | Tipo de dato (uno) | `expect_column_values_to_be_of_type` | select: texto / número / fecha / booleano |
| EXP-DT-011 | Ausencia/Tipo | Tipo de dato (lista de válidos) | `expect_column_values_to_be_in_type_list` | multi-select de tipos |
| EXP-DT-012 | Rango/Set | Entre X e Y | `expect_column_values_to_be_between` | 2 números |
| EXP-DT-013 | Rango/Set | Está en el conjunto | `expect_column_values_to_be_in_set` | lista de valores (texto libre separado por coma) |
| EXP-DT-014 | Rango/Set | No está en el conjunto | `expect_column_values_to_not_be_in_set` | lista de valores |
| EXP-DT-015 | Texto | Longitud entre X e Y | `expect_column_value_lengths_to_be_between` | 2 números enteros |
| EXP-DT-016 | Texto | Longitud = X | `expect_column_value_lengths_to_equal` | 1 número entero |
| EXP-DT-017 | Texto | Coincide con regex | `expect_column_values_to_match_regex` | 1 input de texto (patrón) |
| EXP-DT-018 | Texto | No coincide con regex | `expect_column_values_to_not_match_regex` | 1 input de texto (patrón) |
| EXP-DT-019 | Texto | Coincide con alguno de una lista de regex | `expect_column_values_to_match_regex_list` | textarea, un patrón por línea |
| EXP-DT-020 | Texto | No coincide con ninguno de una lista de regex | `expect_column_values_to_not_match_regex_list` | textarea, un patrón por línea |
| EXP-DT-021 | Texto | Parseable como fecha | `expect_column_values_to_be_dateutil_parseable` | — |
| EXP-DT-022 | Texto | Parseable como JSON | `expect_column_values_to_be_json_parseable` | — |
| EXP-DT-023 | Estadística | Máximo entre X e Y | `expect_column_max_to_be_between` | 2 números |
| EXP-DT-024 | Estadística | Mínimo entre X e Y | `expect_column_min_to_be_between` | 2 números |
| EXP-DT-025 | Estadística | Media entre X e Y | `expect_column_mean_to_be_between` | 2 números decimales |
| EXP-DT-026 | Estadística | Mediana entre X e Y | `expect_column_median_to_be_between` | 2 números decimales |
| EXP-DT-027 | Estadística | Desvío estándar entre X e Y | `expect_column_stdev_to_be_between` | 2 números decimales |
| EXP-DT-028 | Estadística | Cantidad de valores únicos entre X e Y | `expect_column_unique_value_count_to_be_between` | 2 números enteros |
| EXP-DT-029 | Estadística | Proporción de únicos entre X e Y | `expect_column_proportion_of_unique_values_to_be_between` | 2 números (0 a 1) |
| EXP-DT-030 | Estadística | Valor más común está en el conjunto | `expect_column_most_common_value_to_be_in_set` | lista de valores |
| EXP-DT-031 | Estadística | Suma entre X e Y | `expect_column_sum_to_be_between` | 2 números |

Toda expectativa de este nivel admite además el campo opcional **Umbral** (ver 6.4).

### 6.3 Nivel Multicolumna

Acá el selector no elige 1 columna sino 2 o más.

| ID | Expectativa | Equivalente GX | Input(s) en el formulario |
| --- | --- | --- | --- |
| EXP-DT-032 | Columna A > Columna B (u opcional "o igual") | `expect_column_pair_values_a_to_be_greater_than_b` | select A, select B, checkbox "o igual" |
| EXP-DT-033 | Columna A = Columna B | `expect_column_pair_values_to_be_equal` | select A, select B |
| EXP-DT-034 | Combinación de columnas es única por fila | `expect_select_column_values_to_be_unique_within_record` | multi-select de 2+ columnas |
| EXP-DT-035 | Suma de columnas = X | `expect_multicolumn_sum_to_equal` | multi-select de columnas + 1 número (valor objetivo) |

### 6.4 Comportamiento del selector (dinámico)

- Elegir un tipo de expectativa en el dropdown cambia en el momento los inputs que se muestran
  debajo — cada fila de las tablas 6.1/6.2/6.3 es literalmente "tipo elegido → inputs que
  aparecen".
- Cada expectativa agregada se muestra como una "pastilla" removible en la lista de expectativas
  activas de esa columna (o de la Suite, para las de nivel Tabla). Una columna puede acumular
  varias expectativas apiladas.
- Toda expectativa de nivel Columna o Multicolumna tiene un campo adicional opcional **Umbral (%)**
  junto al resto de sus inputs — default 100, editable (REQ-DT-005, BR-DT-004).
- Las expectativas de nivel Tabla no llevan Umbral (son binarias: se cumple la condición estructural
  o no).

## 7. Modelo conceptual de resultado de Corrida

```
CorridaDeValidacion {
  suiteId, suiteSnapshotVersion, datasetName, ejecutadoEn, duracionMs, estadoGeneral,
  coberturaColumnas: [{ columnaEsperada, encontrada }],
  resultadosPorExpectativa: [{
    expId, columna, estado, umbral, porcentajeExito, evaluados, cumplieron,
    muestraFallos: [...], limiteMuestra, totalNoConformes,
    registrosAfectados: [{ rowId, identificadorNegocio? }]
  }]
}
```

## 8. Pantallas (ya validadas en discusión de diseño)

- **Suites de Expectativas** (listado + ABM) — reusa `Table`, `useSearchAndPaginate`, `Dropzone`,
  `Combobox`, `Modal` ya existentes en `apps/web/src/components`.
- **Corridas de Validación** (listado + detalle/reporte) — reusa los mismos patrones que Ciclos de
  Ejecución y Reportes; PDF nuevo (`dataTestReportPdf.js`) hermano de `reportPdf.js`, reusando
  `stripLatexArtifacts`.
- Único componente genuinamente nuevo: selector de Expectativas por columna con inputs dinámicos.

## 9. Fuera de alcance v1

Data Source persistente / conexión a base de datos externa; Google Sheets como origen; corridas
programadas o alertas automáticas.

## 10. [PUNTOS ABIERTOS Y DECISIONES PENDIENTES]

- **[DECISIÓN PENDIENTE]** — A qué microservicio pertenece el módulo: propongo `data-testing-service`
  nuevo (base propia `data_testing_db`), consistente con el patrón "1 servicio = 1 base" ya
  cerrado en el SDLC, dado que ya confirmaste que es "módulo nuevo e independiente". Esto se
  formaliza en la fase de Arquitectura (Documento 3.1) — lo marco acá para que no se pierda.

---

**¿Aprobás este documento para pasar a las etapas de implementación (Etapa 1 en adelante)?**
