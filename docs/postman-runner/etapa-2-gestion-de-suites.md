# Etapa 2 — Gestión de Suites

> **Prerrequisito:** leer `etapa-1-arquitectura.md` antes de implementar esta etapa (contiene el análisis de encaje y las decisiones de arquitectura que aplican a todo el módulo).

## Objetivo

Administrar Suites de Postman: colección + environment, asociadas a Proyecto (y opcionalmente a Requerimiento), con versionado.

## Análisis: qué se reutiliza / qué es nuevo

- Se reutiliza: patrón de subida de archivos con `Dropzone` + validación cliente (igual que `TestCasesPage`/`ExcelTransformerPage`), el `s3Client` de `execution-service`, y `projectsClient` para validar el `projectId` contra `projects-service` (mismo patrón que usa `defects-service`).
- Es nuevo: el modelo `PostmanSuite` no existe. A diferencia de `TestSuite` (`qa-core-service`), que exige `requirementId`, aquí se propone que sea **opcional** — muchas Suites de Postman son smoke/regresión de API transversales que no mapean 1:1 a un Requerimiento funcional.

## Modelo de datos propuesto

**`PostmanSuite`**

| Campo | Tipo | Notas |
|---|---|---|
| `projectId` | String, requerido | Igual convención que `TestSuite`/`Requirement`: referencia lógica a `projects-service`, validada por HTTP. |
| `requirementId` | ObjectId, opcional | A diferencia de `TestSuite`, no es obligatorio (ver Análisis). |
| `name` / `description` | String | Igual que `TestSuite`. |
| `collectionFileUrl` / `collectionVersion` | String / Number | URL en S3 de la versión activa de la colección; versión incremental. |
| `environmentFileUrl` / `environmentVersion` | String / Number, opcional | El environment es opcional (una colección puede no necesitarlo). |
| `timeoutMs` | Number, con default | Usado por el Runner (Etapa 3) para abortar ejecuciones colgadas. |
| `isActive` | Boolean, default `true` | Soft-disable sin borrar histórico de corridas. |
| `createdBy` | String (userId) | Igual convención que `triggeredBy` en `AutomationRun`. |

**`PostmanSuiteVersion`** (colección aparte, no embebida): `suiteId`, `collectionFileUrl`, `environmentFileUrl`, `version`, `createdAt`, `createdBy` — permite re-ejecutar o auditar una versión anterior sin perderla al subir una nueva.

## Endpoints propuestos

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/postman-suites` | Crea la Suite + primera versión (multipart: collection, environment opcional) |
| GET | `/postman-suites` | Lista, filtrable por `projectId`/`requirementId`/`isActive` |
| GET | `/postman-suites/:id` | Detalle + versión activa |
| PATCH | `/postman-suites/:id` | Edita metadatos (`name`/`description`/`timeoutMs`/`isActive`) |
| POST | `/postman-suites/:id/versions` | Sube una nueva versión de colección/environment |
| GET | `/postman-suites/:id/versions` | Lista versiones históricas |
| DELETE | `/postman-suites/:id` | Baja lógica (no borra corridas/versiones asociadas) |

## Validación de archivos

- `collection.json`: debe tener `info.schema` apuntando al schema de Postman Collection v2.1 y al menos un item — se rechaza con 400 si no matchea, mismo estilo de error que ya usa `detectAndParse` en la ingesta actual.
- `environment.json` (si se sube): debe tener un array `values[]` — mismo criterio de validar la forma, no el contenido semántico.
- Tamaño máximo de archivo: mismo mecanismo que ya usa `multer` en las rutas existentes (`AUTOMATION_UPLOAD_MAX_BYTES`), con un límite propio a definir (p. ej. 5 MB, las colecciones de Postman rara vez superan eso).

## Ventajas / Desventajas / Alternativas

- `requirementId` opcional (elegido): más flexible para smoke suites transversales. Desventaja: rompe la simetría con `TestSuite` (que sí lo exige) — se documenta la asimetría explícitamente para que no se lea como inconsistencia accidental.
- Alternativa descartada: exigir `requirementId` igual que `TestSuite`. Más consistente con el resto del dominio, pero fuerza asociar cada colección de API a un Requerimiento aunque no aplique conceptualmente.
- Versionado con historial completo (elegido) vs. sobreescribir el archivo cada vez (más simple, pero pierde trazabilidad de qué colección exacta generó cada corrida histórica — inaceptable para Etapa 8).

## Plan de tests unitarios

- `unit/postmanSuiteValidation.test.js`: valida detección de `collection.json`/`environment.json` válidos e inválidos (igual estilo que `allureParser.test.js`/`newmanParser.test.js` ya existentes).
- `integration/postmanSuites.test.js` (mongodb-memory-server + supertest, mismo patrón que `automationRuns.test.js`): crear, listar, filtrar, editar, versionar y dar de baja una Suite; rechazo de archivos inválidos con 400; rechazo si `projectId` no existe (mock de `projectsClient`).
