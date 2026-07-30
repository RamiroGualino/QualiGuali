# execution-service

Servicio de ejecución de QualiGuali: ciclos de ejecución manual, ejecuciones, evidencias, y desde
la Parte 4 también la ingesta manual de reportes de Automatización Frontend (Allure) y Backend
(Newman) — todo vive en este mismo servicio, no hay uno nuevo para automatización. Se conecta a
la base MongoDB compartida `qualiguali` (colecciones `execution_executionCycles`,
`execution_executions`, `execution_evidence`, `execution_automationRuns`,
`execution_automationTestResults`) y a un bucket S3-compatible (MinIO en local) para las
evidencias y los reportes crudos.

## Auth

Todas las rutas requieren un JWT válido emitido por `auth-service` (`Authorization: Bearer <token>`),
verificado localmente con el mismo `JWT_SECRET`. No hay restricción de rol adicional — cualquier
usuario autenticado puede operar sobre ciclos, ejecuciones y evidencias.

## Endpoints

| Método | Ruta                                     | Descripción                                                                                                                                                |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/execution-cycles`                      | Crea un ciclo. `testPlanId` y/o `requirementIds` (combinables) precargan una `Execution` en `not_executed` por cada `testCaseId` resultante (deduplicado). |
| GET    | `/execution-cycles`                      | Lista ciclos (`?projectId=` opcional).                                                                                                                     |
| GET    | `/execution-cycles/:id`                  | Obtiene un ciclo.                                                                                                                                          |
| GET    | `/execution-cycles/:id/executions`       | Lista las ejecuciones de un ciclo.                                                                                                                         |
| PATCH  | `/execution-cycles/:id`                  | Actualiza nombre/fechas/estado (`planned`\|`in_progress`; para cerrar usar `/close`).                                                                      |
| DELETE | `/execution-cycles/:id`                  | Elimina un ciclo y hace cascade delete de sus ejecuciones/evidencias.                                                                                      |
| POST   | `/execution-cycles/:id/close`            | Cierra el ciclo. `409` si quedan `not_executed` sin `{ "force": true }`. Publica `CycleFinished`.                                                          |
| GET    | `/executions`                            | Lista ejecuciones (`?cycleId=` opcional).                                                                                                                  |
| GET    | `/executions/:id`                        | Obtiene una ejecución.                                                                                                                                     |
| PATCH  | `/executions/:id`                        | Registra resultado `{ status: pass\|fail\|blocked, comments? }`. Publica `ExecutionUpdated`.                                                               |
| POST   | `/executions/:id/evidence`               | Sube un archivo (multipart, campo `file`) a S3/MinIO y lo referencia.                                                                                      |
| GET    | `/executions/:id/evidence`               | Lista la evidencia de una ejecución.                                                                                                                       |
| POST   | `/execution/automation-runs`             | Carga manual (multipart, campo `files`) de un reporte Allure o Newman. Ver detalle abajo.                                                                  |
| GET    | `/execution/automation-runs`             | Lista runs (`?projectId=&tool=&from=&to=` todos opcionales).                                                                                               |
| GET    | `/execution/automation-runs/:id`         | Obtiene un run por su id, incluyendo `rawReportUrl` (usado por `reports-service`, Parte 6).                                                                |
| GET    | `/execution/automation-runs/:id/tests`   | Drill-down de tests de un run (`?status=` opcional).                                                                                                       |
| GET    | `/execution/automation-test-results/:id` | Obtiene un test result por su propio id (usado por `defects-service`, Parte 5, para validar `linkedAutomationTestResultId`).                               |

## Automatización Frontend (Allure) y Backend (Newman)

`POST /execution/automation-runs` recibe, vía multipart, uno o más archivos bajo el campo `files`:

- **Allure**: uno o varios archivos `*-result.json` de `allure-results/` (uno por test). Se agregan
  todos para calcular el resumen del run.
- **Newman**: un único archivo exportado con `newman run ... -r json --reporter-json-export result.json`.

El `tool` se puede declarar explícitamente (`tool=allure` o `tool=newman` como campo del form) o se
detecta por la forma del payload (un solo archivo con `run.executions[]`/`run.stats` → Newman;
todos los archivos con `uuid`/`name`/`status` → Allure). Si no matchea ninguno de los dos formatos,
devuelve `400` con un mensaje claro — nunca intenta adivinar.

Además de parsear el resumen y el detalle por test, el endpoint:

1. Valida `projectId` contra `projects-service` (síncrono, mismo patrón de la Parte 2) y, si viene
   `cycleId`, que ese ciclo exista en este mismo servicio.
2. Sube el archivo crudo a S3/MinIO (`rawReportUrl`). Como Allure son varios archivos pero
   `rawReportUrl` es un único string, cuando hay más de un archivo se empaquetan en un solo JSON
   manifiesto (`{ filename, content }[]`) antes de subir — un solo archivo (caso Newman, o un Allure
   de un solo test) se sube tal cual.
3. Persiste `AutomationRun` + un `AutomationTestResult` por test.
4. Publica el evento `AutomationRunIngested`.

### Parsers

- `src/parsers/allureParser.js`: agrega por `labels[name=suite]` para `suiteName`, usa `stop - start`
  como duración por test, trunca `statusDetails.trace` a 2000 caracteres. El resumen del run
  (`executedAt`, `durationMs`) se deriva del span real (`start` más temprano → `stop` más tardío)
  entre todos los archivos, ya que Allure no tiene un archivo de resumen propio.
- `src/parsers/newmanParser.js`: un `AutomationTestResult` por `run.executions[]` (falla si
  cualquiera de sus `assertions[]` trae `error`); `suiteName` sale de `collection.info.name`.
  **Desvío respecto al prompt** (ver sección de decisiones más abajo): el resumen
  (`total/passed/failed`) se calcula a partir de `run.executions[]`, no de `run.stats.assertions`,
  para que `totalTests` siempre coincida con la cantidad real de `AutomationTestResult` guardados.

### Límites

Cada archivo individual está limitado a `AUTOMATION_UPLOAD_MAX_BYTES` (default 50MB, configurable).

## Reglas de negocio implementadas

- **Precarga desde un plan y/o desde Requerimientos**: al crear un ciclo, `testPlanId` y
  `requirementIds` son dos orígenes independientes y combinables para la misma precarga. Con
  `testPlanId` se obtiene el `TestPlan` de `qa-core-service`; con `requirementIds` se resuelve, por
  cada requerimiento, todos los casos de prueba de sus suites vía
  `GET /requirements/:id/test-cases` (jerarquía Requerimiento → Suite → Caso de `qa-core-service`).
  Los `testCaseId` de ambos orígenes se combinan sin duplicados y cada uno se valida contra
  `qa-core-service` (mismo patrón de validación cruzada de la Parte 2) antes de precrear las
  `Execution` — si el plan, algún requerimiento, o algún caso no existen, el ciclo recién creado se
  revierte (rollback) y se responde `400`.
- **Evidencia nunca huérfana**: `POST /executions/:id/evidence` sólo acepta archivos sobre una
  `Execution` ya existente.
- **Cierre de ciclo**: por defecto rechaza cerrar (`409`) si quedan ejecuciones `not_executed`; el
  caller puede forzar el cierre con `{ "force": true }` (la decisión de UX de cuándo forzar queda
  del lado del frontend, como pide el prompt).
- **Sin aislamiento por cliente/tenant**: todo listado se filtra únicamente por `projectId`
  (`?projectId=` en `/execution-cycles`).

## Eventos de dominio publicados

- `ExecutionUpdated` — al registrar un resultado (`PATCH /executions/:id`).
- `CycleFinished` — al cerrar un ciclo (`POST /execution-cycles/:id/close`).
- `AutomationRunIngested` — al ingerir un run de Allure/Newman (`POST /execution/automation-runs`).

`AutomationRunIngested` tiene, en Arquitectura v1.2 §9.4, un payload de ejemplo **plano** (sin
envoltura, con `eventType` en vez de `type`). Nuestro `createEventPublisher` (definido en la Parte 3) envuelve todo evento en `{ eventId, type, source, occurredAt, payload }`. Mantuvimos el mismo
publisher para los tres eventos por consistencia y para no romper `ExecutionUpdated`/`CycleFinished`
ya implementados; el contenido de `payload` respeta los nombres de campo exactos del ejemplo
(`automationRunId`, `projectId`, `cycleId`, `tool`, `summary`, `executedAt`), pero la envoltura
externa difiere del ejemplo literal del documento. **Marcado para revisión del Architect** — no se
tocó el documento de arquitectura.

**Actualización Parte 6**: desde que `reports-service` existe como consumer real, este servicio
publica de verdad a un topic SNS (LocalStack en local — ver `AWS_ENDPOINT_URL`/`SNS_TOPIC_ARN` en
`.env.example`) en vez de sólo loguear. El código de este servicio no cambió — sólo la
implementación interna de `createEventPublisher` en `packages/shared`, que sigue funcionando en
modo "solo log" si esas variables no están configuradas (por ejemplo, en los tests).

Todavía no hay infraestructura real de SNS/SQS en este roadmap (es trabajo de DevOps/IaC en una
parte futura), así que "publicar" hoy significa construir el sobre estándar de evento
(`packages/shared`'s `createEventPublisher`) y loguearlo estructuradamente — así el flujo queda
observable hasta que exista un consumer real (`reports-service`). El mecanismo es reusable por
las partes futuras sin cambiar los call sites: cuando haya un topic SNS real, solo cambia la
implementación interna de `createEventPublisher`.

## Evidencia: S3 / MinIO

En local, `docker-compose.yml` levanta un contenedor MinIO (compatible con la API S3) además de
Mongo. El servicio crea el bucket automáticamente al arrancar si todavía no existe (`ensureBucket()`
en `src/clients/s3Client.js`), así que no hace falta un contenedor `mc` aparte para inicializarlo.

## Correr en local

```bash
# desde la raíz del monorepo
pnpm install

cd services/execution-service
cp .env.example .env   # completar JWT_SECRET (mismo valor que los demás servicios)

pnpm start              # o `pnpm dev`
```

Requiere `qa-core-service` corriendo (para la validación cruzada) y un endpoint S3-compatible
(MinIO) alcanzable en `S3_ENDPOINT`. Con Docker Compose desde la raíz (`docker-compose up`) se
levantan Mongo, MinIO y los 4 servicios juntos, ya cableados entre sí.

### Prueba de punta a punta manual (contra servicios reales)

```bash
docker-compose up -d
pnpm --filter auth-service seed   # si todavía no existe el Super Admin
pnpm e2e:smoke                     # desde la raíz del monorepo
```

`scripts/e2e-smoke.js` (raíz del monorepo) ahora también cubre la Parte 3: crea un ciclo desde el
plan de prueba de la Parte 2, marca una ejecución como `pass`, sube evidencia a MinIO y cierra el
ciclo — todo contra los servicios realmente corriendo. Los eventos publicados (`ExecutionUpdated`,
`CycleFinished`) se ven en los logs de `execution-service` (`docker-compose logs -f
execution-service`), ya que todavía no hay un consumer real escuchándolos.

## Variables de entorno

| Variable                      | Requerida | Default                                | Descripción                                                                 |
| ----------------------------- | --------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `PORT`                        | No        | `4003`                                 | Puerto HTTP del servicio.                                                   |
| `NODE_ENV`                    | No        | `development`                          | Entorno de ejecución.                                                       |
| `MONGODB_URI`                 | No        | `mongodb://localhost:27017/qualiguali` | URI de la base compartida (misma para todos los servicios).                 |
| `JWT_SECRET`                  | **Sí**    | —                                      | Debe coincidir con el de los demás servicios.                               |
| `QA_CORE_SERVICE_URL`         | No        | `http://localhost:4002`                | Base URL de `qa-core-service` para la validación cruzada.                   |
| `PROJECTS_SERVICE_URL`        | No        | `http://localhost:4001`                | Base URL de `projects-service` para validar `projectId` en automation-runs. |
| `AUTOMATION_UPLOAD_MAX_BYTES` | No        | `52428800` (50MB)                      | Tamaño máximo por archivo subido a `/execution/automation-runs`.            |
| `S3_ENDPOINT`                 | No        | `http://localhost:9000`                | Endpoint S3-compatible (MinIO en local, S3 real en AWS).                    |
| `S3_REGION`                   | No        | `us-east-1`                            | Región (MinIO la ignora, pero el SDK la exige).                             |
| `S3_BUCKET`                   | No        | `qualiguali-evidence`                  | Bucket donde se guardan las evidencias.                                     |
| `S3_ACCESS_KEY_ID`            | No        | `minioadmin`                           | Access key.                                                                 |
| `S3_SECRET_ACCESS_KEY`        | No        | `minioadmin`                           | Secret key.                                                                 |
| `S3_FORCE_PATH_STYLE`         | No        | `true`                                 | Requerido por MinIO; poner en `false` contra S3 real si hace falta.         |
| `S3_PUBLIC_URL_BASE`          | No        | (usa `S3_ENDPOINT`)                    | Host alternativo para `Evidence.fileUrl` si difiere del endpoint interno.   |

## Tests

```bash
cd services/execution-service
pnpm test
```

- **Unitarios**: precarga de ejecuciones desde un plan (`buildExecutionDocs` — deduplicación, forma
  de los documentos), lógica de registro de resultado (`applyExecutionResult` — estados válidos,
  re-ejecución, `executedAt`/`executedBy`), parser de Allure y de Newman con fixtures en
  `tests/__fixtures__/` (incluyendo casos con tests fallidos para `errorMessage`/`stackTraceExcerpt`
  y truncado a 2000 caracteres), detección de herramienta (`detectTool`/`detectAndParse`), y
  empaquetado del reporte crudo (`buildRawReportUpload`).
- **Integración** contra `mongodb-memory-server`, con `qa-core-service`, `projects-service` y
  S3/MinIO mockeados (`jest.mock('../../src/clients/...')`): CRUD de ciclos, precarga y rollback
  ante plan/caso inválido, registro de resultados, subida de evidencia (multipart), cierre con/sin
  `force`, ingesta end-to-end de un fixture real de Allure y uno de Newman (verificando persistencia
  y publicación de `AutomationRunIngested`), listado con filtros y drill-down por estado, y el flujo
  completo de punta a punta de ejecución manual con verificación de que `ExecutionUpdated` y
  `CycleFinished` se publican.
