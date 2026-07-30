# QualiGuali — Documentación funcional

Guía de referencia de qué hace cada módulo de la aplicación, pensada para quien usa QualiGuali día
a día (QA Engineer, Admin, Super Admin) o para quien necesita explicarle el producto a alguien más.
No es documentación técnica — para stack, dependencias y arquitectura ver
`docs/DOCUMENTACION_TECNICA.md`.

## Índice

- [Roles y permisos](#roles-y-permisos)
- [Selector de proyecto](#selector-de-proyecto)
- [Dashboard (Home del proyecto)](#dashboard-home-del-proyecto)
- [Gestión de Proyectos](#gestión-de-proyectos)
  - [Proyectos](#proyectos)
  - [Módulos funcionales](#módulos-funcionales)
  - [Requerimientos](#requerimientos)
- [Gestión de Casos de Prueba](#gestión-de-casos-de-prueba)
  - [Suites de prueba](#suites-de-prueba)
  - [Casos de prueba](#casos-de-prueba)
  - [Plantillas de caso de prueba](#plantillas-de-caso-de-prueba)
  - [Transformador de Excel](#transformador-de-excel)
- [Gestión de Ciclos de Prueba](#gestión-de-ciclos-de-prueba)
  - [Planes de prueba](#planes-de-prueba)
  - [Ciclos de ejecución](#ciclos-de-ejecución)
  - [Ejecución manual de un caso](#ejecución-manual-de-un-caso)
- [Automatización](#automatización)
- [Defectos](#defectos)
- [Reportes](#reportes)
  - [Reporte PDF](#reporte-pdf)
- [Configuración](#configuración)

## Roles y permisos

| Rol             | Alcance                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Super Admin** | Acceso total, incluida la gestión de Usuarios. Se crea únicamente por script de seed (`pnpm --filter auth-service seed`) — no existe alta de Super Admin desde la UI. |
| **Admin**       | Gestión de Proyectos y todo lo demás, salvo Usuarios.                                                                                                                 |
| **QA Engineer** | Operación día a día (Casos de prueba, Ciclos, Defectos, Automatización, Reportes) sobre los proyectos que tenga asignados en Usuarios.                                |

Cada usuario (salvo Super Admin) tiene una lista de proyectos asignados — solo ve/opera sobre esos.

## Selector de proyecto

El desplegable arriba a la izquierda (junto al logo) es el único lugar para entrar o cambiar de
proyecto. Recuerda el último proyecto visitado aunque navegues a una pantalla sin proyecto en la
URL (la lista de Proyectos, o Configuración) — al volver a entrar a un módulo con proyecto, retoma
ese mismo.

## Dashboard (Home del proyecto)

Pantalla de aterrizaje al entrar a un proyecto. Muestra:

- KPIs generales: módulos/requerimientos, casos de prueba, ejecuciones (con desglose
  pasó/falló/bloqueado/pendiente), defectos abiertos.
- Gráfico de barras apiladas de casos de prueba por requerimiento (una barra por requerimiento,
  segmentada por estado de sus ejecuciones).
- Dona de cobertura de requerimientos (con vs. sin casos de prueba asociados).
- Resumen ejecutivo en texto plano con los mismos números, para copiar/pegar rápido.

## Gestión de Proyectos

### Proyectos

Alta/edición/baja, con estado **Activo** o **Archivado**. Solo Super Admin y Admin pueden
crear/editar/eliminar — QA Engineer solo ve los que tiene asignados.

### Módulos funcionales

Agrupan Requerimientos dentro de un proyecto (ej. "Facturación", "Reintegros"). Cada uno tiene
nombre, descripción y un campo `Orden` numérico para controlar cómo aparecen listados. La acción
"Visualizar" de un módulo lleva a Requerimientos con ese módulo ya filtrado.

### Requerimientos

Pantalla maestro-detalle: panel izquierdo con la lista buscable de Módulos del proyecto (elegir uno
filtra el panel derecho); panel derecho con la tabla de Requerimientos de lo seleccionado (o de
todos, sin módulo elegido).

Cada requerimiento tiene:

- **Código** autogenerado (`REQ-XXX`), con link directo a Jira si se cargó una URL.
- **Prioridad** (Baja/Media/Alta/Crítica) y **Estado** (Borrador/En test/Finalizado/Cancelado) —
  el estado se puede cambiar directo desde la tabla, sin abrir el modal de edición.
- Columna de **cobertura**: cantidad de Suites y Casos de prueba asociados, con link directo a
  Suites de prueba filtradas por ese requerimiento.

Desde acá se filtra por Módulo (vía el panel izquierdo), Estado y Prioridad a la vez.

## Gestión de Casos de Prueba

Pestañas: **Suites de prueba**, **Casos de prueba**, **Plantillas de caso de prueba**,
**Transformador de Excel**.

### Suites de prueba

Agrupan Casos de prueba bajo un Requerimiento. El campo Requerimiento es un combobox (escribir o
elegir de la lista) que nunca muestra el código interno del requerimiento (`REQ-XXX`), solo su
título — y al elegir uno, precompleta el nombre de la suite con ese mismo título (editable después).
Eliminar una suite borra en cascada todos sus casos de prueba (con confirmación explícita).

### Casos de prueba

Formulario completo estilo Kualitee:

- **Información general**: prioridad, estado, tipo de ejecución (Manual/Automatizado), tipo de
  testing (Funcional/Regresión/Smoke/Integración/UAT/Performance/Seguridad/Otro).
- **Información adicional**: build, módulo, nombre/resumen de escenario, tiempo estimado,
  asignado.
- **Test Case ID**: identificador propio del caso (el que trae un Excel importado, o el que use el
  equipo, ej. `TC-014`) — es lo único que se muestra en toda la app; el código interno autogenerado
  (`TC-XXX` correlativo por suite) existe solo para ordenar y garantizar unicidad en la base, nunca
  se ve en pantalla ni en el PDF.
- **Precondiciones / Pasos / Resultado esperado / Postcondiciones**, más los campos custom que
  defina la Plantilla del proyecto (ver más abajo).
- **Dos flags independientes de automatización** — "Automatizado - Front/UI" y "Automatizado - API".
  Un caso puede estar automatizado en ninguna, una o ambas capas, sin relación con su `Tipo de
ejecución` (que solo indica cómo se corre _hoy_, manual o automatizado).

**Listado**: columnas Test Case ID, Prioridad, Nombre, Estado, Resumen/Descripción y Resultado
esperado (estas dos últimas en blanco si el caso no tiene valor cargado, sin un "—" de relleno) —
ordenado siempre por el número de Test Case ID (`TC-9` antes que `TC-10`, no alfabéticamente).
Filtra por Requerimiento y por Suite.

**Import/Export en Excel real (`.xlsx`)**, layout fijo de 19 columnas (17 del template estilo
Kualitee más las 2 de automatización), pensado para ida y vuelta sin remapeo manual — lo que se
exporta se puede reimportar tal cual. El import también acepta `.xls`/`.csv`.

### Plantillas de caso de prueba

Definen campos custom (texto/número/booleano/selección, marcables como obligatorios) que después
aparecen en el formulario de Crear/Editar caso de prueba de ese proyecto. Desde acá también se
puede armar y descargar una **plantilla Excel en blanco** (columnas editables, agregar/quitar,
"restaurar por defecto") para compartir con alguien externo (o pegarle a un LLM) y después traer lo
completado por el Transformador de Excel.

### Transformador de Excel

Importador flexible para archivos que **no** vienen en el formato fijo de Casos de prueba: subís
cualquier planilla (Excel/CSV), el sistema detecta sus columnas, y las mapeás manualmente contra
"nuestro formato de caso de prueba" (Título, Resumen, Prioridad, Precondiciones, Pasos, Resultado
esperado, etc. — solo Título es obligatorio, el resto tiene default sensato si no se mapea). Todo
lo importado entra a la Suite elegida arriba del uploader. También tiene la exportación al formato
Kualitee original (columnas fijas, sin mapeo).

## Gestión de Ciclos de Prueba

Pestañas: **Planes de prueba**, **Ciclos de ejecución**.

### Planes de prueba

Agrupan qué Casos de prueba se van a ejecutar, con estado (Borrador/Activo/Cerrado) y rango de
fechas. La acción "Agregar casos de prueba" suma casos sueltos al plan en cualquier momento (no
solo al crearlo). "Ver ciclos" lleva a Ciclos de ejecución filtrados por ese plan.

### Ciclos de ejecución

Instancia ejecutable de un Plan — se crea eligiendo Plan + Suite (el campo Nombre es un combobox
que auto-completa/auto-selecciona la Suite y viceversa, ya que un ciclo casi siempre se llama como
su suite), con checklist de qué casos de esa suite entran (buscable, "seleccionar todos"/"deseleccionar
todos"), asignado, fechas y prioridad.

El listado muestra, por ciclo: plan, suite, asignado, fechas, cantidad de casos, una barra de
resultados compacta (pasó/falló/bloqueado/pendiente) y su estado — con dos accesos directos por
fila: 👁 abre el detalle completo del ciclo, ▶ abre el **modal de ejecución rápida** (ver abajo) sin
salir del listado. Un ciclo se puede duplicar (clona la lista de casos, no el historial de
ejecución) y se cierra manualmente (o forzado, si quedan casos sin ejecutar) desde su detalle.

### Ejecución manual de un caso

Hay dos formas de ejecutar, ambas comparten el mismo panel de información del caso:

- **Detalle completo del ciclo** (👁): tabla de todos los casos del ciclo con su estado actual;
  click en un caso abre un drawer lateral con toda su info (precondiciones, pasos, resultado
  esperado), selector de estado + botón "Ejecutar", y navegación Anterior/Siguiente entre casos.
- **Ejecución rápida** (▶, desde el listado o desde el detalle del ciclo): un modal centrado con
  cuatro botones grandes — **Falló / Pasó / Bloqueado / Siguiente** — pensado para recorrer todo un
  ciclo sin tocar ningún selector. Marcar Falló/Pasó/Bloqueado solo registra el resultado y se queda
  en el mismo caso; avanzar al siguiente es siempre un click aparte en "Siguiente" (o "Anterior"
  para volver, ambos más chicos que los tres botones de resultado).

En ambos casos:

- El campo **"Resultado obtenido"** viene precompletado con el resultado documentado del caso (si
  lo tiene) la primera vez que se ejecuta; en re-ejecuciones arranca vacío, ya que lo anterior ya
  quedó en el historial.
- **Evidencia**: se puede pegar una captura (Ctrl+V), arrastrar un archivo, o elegirlo — con una
  herramienta de anotación (rectángulos, flechas, círculos, en varios colores) antes de subir. Al
  marcar Pasó/Falló/Bloqueado con una imagen ya cargada, se sube sola (no hace falta un botón
  aparte de "guardar evidencia"). Una vez subida, se puede ver en grande (lightbox), editar
  (reabre el anotador) o eliminar cada foto individualmente.
- **Historial de ejecuciones**: siempre visible (no hay que expandirlo), un intento por tarjeta —
  estado, fecha, quién lo ejecutó, el texto de "Resultado obtenido" de ese intento en particular, y
  sus fotos. Cada tarjeta tiene su propio botón para eliminar el registro completo (con
  confirmación — si era el intento más reciente, el estado del caso se recalcula al que le sigue) y
  un "+ Agregar foto" para sumarle más evidencia después, incluso a un intento que no es el más
  reciente.
- Si el caso queda en **Falló**, el mismo panel tiene un botón para crear el Defecto relacionado
  sin salir de la pantalla, con la descripción pre-armada a partir de la info del caso.

## Automatización

Dos sub-módulos, **UI** y **API**, sobre el mismo dato de fondo (el campo `tool` de cada corrida:
`allure` para UI/E2E, `newman` para colecciones de Postman). Cada uno permite:

- Subir uno o más archivos de reporte (arrastrar o elegir) — la herramienta se autodetecta por el
  contenido, o se puede forzar manualmente; asociar la carga a un Ciclo de ejecución es opcional.
- Ver el resumen de cada corrida: total de tests, pasaron, fallaron.
- "Ver fallos": lista los tests fallidos de esa corrida puntual (suite + nombre).
- Link directo al reporte crudo tal como se subió.

## Defectos

Alta manual (desde el listado) o automática (desde un caso de ejecución manual fallado, con
descripción pre-armada). Cada defecto tiene código autogenerado, severidad (Baja/Media/Alta/
Crítica), descripción, resultado obtenido (si vino de un caso fallado), evidencia (imágenes/video,
editable con el mismo anotador que en ejecución), comentarios, y un campo de URL para vincular el
ticket de Jira correspondiente.

**Estado con flujo controlado** (no se puede saltear pasos):

```
abierto → en curso → resuelto → cerrado
                          ↑           ↓
                          └── reabierto
```

## Reportes

Por Ciclo de ejecución (elegible desde un desplegable arriba): métricas de cantidad de casos por
estado leídas en vivo de `execution-service` (no de un caché que puede desincronizarse si se
pierde un evento), una barra de distribución que además funciona como filtro clickeable, un listado
de casos filtrable que abre el mismo panel de ejecución/evidencia/defecto que en Ciclos, tendencia
de pass rate en el tiempo (filtrable por origen: manual/Allure/Newman/combinado), y una tabla de
fallos de automatización por origen.

### Reporte PDF

Botón "Descargar PDF" genera un PDF real (texto + vectores, no una captura de pantalla) con diseño
propio tipo herramienta profesional de QA (TestRail/Zephyr):

- Encabezado, dashboard de KPIs (tarjetas + barra de distribución de estado) y tabla resumen de
  casos.
- **Detalle caso por caso, cada uno en su propia hoja**: ID del caso en azul corporativo, título
  grande, badge de estado con fondo suave; Prioridad/Tipo de prueba/Tipo de ejecución como chips;
  Precondiciones y Resultado esperado con viñetas (las de Resultado esperado en verde); Pasos
  numerados con círculos; Historial de ejecuciones como tarjetas con borde — estado, fecha,
  ejecutor, "Resultado obtenido" como subtítulo en negrita seguido del texto, y sus fotos en un
  grid de ancho uniforme con marco y sombra suave.
- Tabla de fallos de automatización al final, si los hay.

No incluye la tendencia (queda solo en la pantalla, no en el PDF exportado).

## Configuración

- **General**: idioma (Español/English) y tema (Claro/Oscuro) — visible para cualquier rol.
- **Usuarios**: alta/edición/baja, rol (Admin/QA Engineer — Super Admin no se crea por acá) y
  proyectos asignados. Solo visible/accesible para Super Admin.
