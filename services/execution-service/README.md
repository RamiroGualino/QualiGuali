# execution-service

Servicio de ejecución de QualiGuali: ciclos de ejecución manual, ejecuciones, evidencias, la
ingesta manual de reportes de Automatización Frontend (Allure) y Backend (Newman), y desde las
Etapas 2 y 3 del módulo Ejecutor de Colecciones (`docs/postman-runner/`) también la gestión de
Suites de Postman y su ejecución en vivo con Newman (librería `newman`, en proceso), y desde la
Etapa 6 la programación automática de esas Suites por cron (librería `node-cron`, en proceso) —
todo vive en este mismo servicio, no hay uno nuevo para automatización. Se conecta a
la base MongoDB compartida `qualiguali` (colecciones `execution_executionCycles`,
`execution_executions`, `execution_evidence`, `execution_automationRuns`,
`execution_automationTestResults`, `execution_postmanSuites`, `execution_postmanSuiteVersions`,
`execution_postmanSchedules`) y a un bucket S3-compatible (MinIO en local) para las evidencias, los
reportes crudos, y las colecciones/environments de Postman.

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
| GET    | `/execution/automation-runs`             | Lista runs (`?projectId=&tool=&from=&to=&postmanSuiteId=` todos opcionales).                                                                               |
| GET    | `/execution/automation-runs/:id`         | Obtiene un run por su id, incluyendo `rawReportUrl` (usado por `reports-service`, Parte 6).                                                                |
| GET    | `/execution/automation-runs/:id/tests`   | Drill-down de tests de un run (`?status=` opcional).                                                                                                       |
| GET    | `/execution/automation-test-results/:id` | Obtiene un test result por su propio id (usado por `defects-service`, Parte 5, para validar `linkedAutomationTestResultId`).                               |
| POST   | `/postman-suites`                        | Crea una Suite de Postman (multipart: `collection` requerido, `environment` opcional) + su versión 1. Ver detalle abajo.                                   |
| GET    | `/postman-suites`                        | Lista Suites (`?projectId=&requirementId=&isActive=` todos opcionales).                                                                                    |
| GET    | `/postman-suites/:id`                    | Obtiene una Suite (incluye la versión de colección/environment activa).                                                                                    |
| PATCH  | `/postman-suites/:id`                    | Edita metadatos únicamente: `name`/`description`/`timeoutMs`/`isActive`.                                                                                   |
| POST   | `/postman-suites/:id/versions`           | Sube una nueva versión (multipart: `collection` requerido, `environment` opcional).                                                                        |
| GET    | `/postman-suites/:id/versions`           | Lista el historial de versiones de una Suite (más nueva primero).                                                                                          |
| DELETE | `/postman-suites/:id`                    | Baja lógica (`isActive=false`) — no borra versiones ni corridas asociadas.                                                                                 |
| POST   | `/postman-suites/:id/run`                | Dispara una ejecución en vivo de la Suite con Newman. `202` inmediato (no bloquea el request). `409` si esa Suite ya está corriendo. Ver detalle abajo.    |

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

## Suites de Postman (Etapa 2 del módulo Ejecutor de Colecciones — `docs/postman-runner/`)

Gestión de Suites de Postman: colección + environment opcional, versionadas, asociadas a un
Proyecto y (a diferencia de `TestSuite` de `qa-core-service`) **opcionalmente** a un Requerimiento —
muchas suites de API son smoke/regresión transversales que no mapean 1:1 a un requerimiento
funcional. Administra los archivos y su historial; ejecutarlas es la Etapa 3 (Runner, ver más
abajo).

- **Validación de archivos**: `collection` debe tener `info.schema` apuntando al schema de Postman
  Collection v2 y al menos un `item` (se rechaza con `400` si no matchea, mismo estilo de error que
  `detectAndParse` usa para Allure/Newman); `environment`, si se sube, debe tener un array
  `values[]`. Solo se valida la forma, no el contenido semántico — un request roto adentro de una
  colección válida recién se nota cuando el Runner (Etapa 3) intenta ejecutarlo.
- **`projectId` se valida contra `projects-service`** (síncrono, mismo patrón que
  `/execution/automation-runs`) antes de crear la Suite o subir ningún archivo.
- **Versionado real, no sobrescritura**: cada `POST /postman-suites/:id/versions` crea un
  `PostmanSuiteVersion` nuevo (nunca se pisa uno existente) y sube un nuevo `collectionVersion`
  siempre; `environmentVersion` solo avanza si ese POST también trajo un `environment` nuevo — subir
  solo una colección corregida no fuerza a resubir un environment que no cambió. Perder ese
  historial habría hecho imposible, más adelante (Etapa 8), rastrear qué colección exacta produjo
  una corrida vieja.
- **Baja lógica**: `DELETE /postman-suites/:id` marca `isActive=false` sin borrar versiones ni
  corridas — mismo campo que ya expone `PATCH`, como endpoint REST propio.
- Límite de tamaño por archivo: `POSTMAN_UPLOAD_MAX_BYTES` (default 5MB — son JSON de texto, no
  reportes binarios).

## Motor de ejecución de Suites de Postman (Etapa 3 — `docs/postman-runner/`)

`POST /postman-suites/:id/run` corre una Suite con [Newman](https://www.npmjs.com/package/newman)
**en proceso** (misma librería programática, no el CLI vía `child_process`, no un microservicio
aparte — decisión de arquitectura de `etapa-1-arquitectura.md`), descargando su
`collectionFileUrl`/`environmentFileUrl` (S3) y pasando el resultado por el mismo
`parseNewmanReport()` que ya usa la carga manual — nada distingue, río abajo, una corrida en vivo de
un archivo subido a mano.

- **`202 Accepted` inmediato**: el endpoint no espera a que Newman termine (puede tardar hasta
  `suite.timeoutMs`) — dispara la corrida y responde. El `AutomationRun` recién se persiste, de
  forma asincrónica, cuando Newman efectivamente termina.
- **Guarda de concurrencia**: un `Set` en memoria de `suiteId`s corriendo (una sola instancia de
  este servicio para el MVP, ver `etapa-1-arquitectura.md` §Estrategia de escalabilidad) — una
  segunda corrida de la misma Suite mientras la anterior sigue activa se rechaza con `409`.
- **Guarda de timeout**: si se supera `suite.timeoutMs`, se llama a `emitter.abort()` de Newman y la
  corrida se resuelve como `{ status: 'failed', reason: 'timeout' }` — nunca cuelga el proceso.
- **`services/postmanRunner.service.js` nunca rechaza/lanza** para un resultado esperado (ya
  corriendo, error de descarga, error de ejecución de Newman, timeout) — siempre resuelve con un
  `status` descriptivo (`completed`/`failed`/`rejected`), para que un futuro caller (el scheduler de
  la Etapa 6) tenga un contrato único sin mezclar excepciones con resultados.
- **Reutiliza `persistAutomationRun`** (factorizada de `automationRuns.controller.js` en
  `services/automationRunPersistence.service.js`) para crear el `AutomationRun` +
  `AutomationTestResult[]` + publicar `AutomationRunIngested` — mismo camino que la carga manual.
- **`reporters` vacío a propósito**: el resumen que este módulo lee (`run.executions`/`run.stats`/
  `run.timings`) lo arma el runner core de Newman, no el reporter `"json"` — ese reporter solo existe
  para volcar ese mismo resumen a un archivo en disco (incondicionalmente, `export: false` no lo
  suprime, ver `postmanRunner.service.js`), algo que no necesitamos ya que el callback ya nos da todo
  en memoria.

## Modelo de resultados (Etapa 4 — `docs/postman-runner/`)

Extiende `AutomationRun` y `AutomationTestResult` para que una corrida en vivo del Runner (Etapa 3)
quede completamente trazable y con el mismo nivel de detalle que dio Postman/Newman en el momento de
ejecutar, no solo el resumen agregado.

- **`AutomationRun.postmanSuiteId`/`triggerType`**: cierran el límite que dejaba la Etapa 3 — toda
  corrida disparada por `POST /postman-suites/:id/run` ahora referencia su `PostmanSuite` de origen
  (`postmanSuiteId`) y cómo se disparó (`triggerType: 'manual'`; `'scheduled'`/`'retry'` agregados por
  la Etapa 6, ver abajo). `null`/`'manual'` respectivamente para Allure y para una carga manual de
  Newman, que no tienen Suite asociada.
- **`AutomationTestResult.method`/`url`/`requestHeaders`/`requestBody`/`responseStatus`/
  `responseHeaders`/`responseBody`/`logs`**: por-ejecución, tomados directo de los objetos SDK de
  Newman (`execution.request`/`execution.response`, no el JSON ya serializado) en
  `postmanRunner.service.js#extractRequestDetails`. `logs` es el output de `console.log`/`warn`/
  `error` de los test scripts de esa request puntual — solo capturable en vivo, vía el evento
  `'console'` del emitter de Newman (nunca aparece en el summary final, ver el comentario en
  `collectConsoleLogs`), por eso es exclusivo de una corrida del Runner y siempre `[]` para Allure o
  un reporte de Newman subido a mano.
- **Almacenamiento híbrido Mongo/S3** (`services/resultStorage.service.js`): cada campo de
  headers/body se guarda inline en Mongo si pesa ≤20KB (`Buffer.byteLength`, no longitud de string,
  para no subestimar texto multi-byte), o se sube a S3 y solo se guarda la URL si lo supera —
  evita que un body grande infle indefinidamente `AutomationTestResult` y sus índices. `logs` se
  trunca aparte (50 líneas, 2000 caracteres cada una) en vez de pasar por esta misma estrategia, ya
  que es una lista acotada por diseño, no un valor único que pueda crecer sin límite.
- **`persistAutomationRun` es el único punto de escritura** para ambos casos (carga manual y corrida
  en vivo) — el almacenamiento híbrido y el truncado de logs corren ahí, no en el controller, así que
  ninguno de los dos callers necesita saber cómo se decide inline-vs-S3.

## Programación automática (Etapa 6 — `docs/postman-runner/`)

Corre Suites por cron además de manualmente, reutilizando el mismo motor de ejecución de la Etapa 3
— el scheduler sólo decide _cuándo_ llamar a `runSuite()`, nunca reimplementa cómo correr Newman.

- **`services/postmanSuiteRunOrchestrator.service.js#runAndPersistPostmanSuite`**: la secuencia
  "correr la Suite y, si terminó bien, subir el reporte crudo y persistir el `AutomationRun`" —
  extraída del controller de la Etapa 3 (que antes la tenía inline) porque ahora tiene tres
  callers idénticos en esa parte: el trigger manual (`POST /postman-suites/:id/run`), el scheduler
  (abajo) y el retry (`POST /execution/automation-runs/:id/retry`, abajo también). Recibe cualquier
  objeto con la forma de una `PostmanSuite` (`_id`/`projectId`/`collectionFileUrl`/
  `environmentFileUrl`/`timeoutMs`/`collectionVersion`/`environmentVersion`), no necesariamente un
  documento Mongoose real — el retry se apoya en esto para pasar un objeto "pineado" a una versión
  histórica en vez de la Suite actual.
- **`PostmanSchedule`** (`execution_postmanSchedules`): `suiteId` + `cronExpression` (validada con
  `node-cron` — ver `services/cronSchedule.service.js`, que expone `validate()`/`getNextRun()` sin
  agregar una segunda librería de parseo de cron) + `timezone` (default `UTC`) + `isActive` +
  `lastRunAt`/`lastRunStatus` (denormalizados para que la UI de administración de schedules no
  necesite una segunda consulta a `AutomationRun` por cada fila).
- **`services/postmanScheduler.service.js`**: el puente en memoria entre `PostmanSchedule` y tareas
  reales de `node-cron` (`registeredTasks`, un `Map<scheduleId, ScheduledTask>`) — igual razonamiento
  que el `Set` de `runningSuiteIds` de la Etapa 3: vive sólo en la memoria de este proceso, suficiente
  para el MVP de una sola instancia (ver `etapa-1-arquitectura.md`, "Estrategia de escalabilidad"),
  no coordina múltiples instancias. `bootstrapSchedules()` corre una vez al iniciar el servidor
  (`server.js`) y registra todo `PostmanSchedule` con `isActive: true`; `registerSchedule()` se llama
  de nuevo después de cada create/update vía API para recargar la tarea en caliente, sin reiniciar el
  proceso (des-registra la tarea vieja, registra la nueva sólo si `isActive`). Cada disparo cron
  llama a `runAndPersistPostmanSuite(suite, { triggerType: 'scheduled', triggeredBy: 'scheduler' })`
  — el mismo guard de concurrencia de la Etapa 3 (`runningSuiteIds`, dentro de `runSuite()`) es lo que
  efectivamente rechaza un disparo cron que cae mientras esa misma Suite ya está corriendo manualmente;
  el resultado (`completed`/`failed`/`rejected`) queda igual registrado en
  `PostmanSchedule.lastRunAt`/`lastRunStatus`, nunca se pierde en silencio.
- **`POST /execution/automation-runs/:id/retry`**: re-dispara una corrida con el/los archivo(s) de
  colección/environment **exactos** que usó esa corrida — no los que la Suite tiene hoy, que pueden
  haber cambiado desde entonces. Por eso `AutomationRun` ahora también guarda
  `collectionVersion`/`environmentVersion` (la versión de la Suite en el momento de esa corrida, no
  la actual) — el retry resuelve esos números contra `PostmanSuiteVersion` para recuperar las URLs
  históricas correctas. Sólo tiene sentido para una corrida con `postmanSuiteId` (una carga manual o
  un run de Allure no tienen Suite/versión a la cual "pinear"), responde 400 si no lo tiene, 409 si la
  versión referenciada ya no existe en el historial.

| Método | Ruta                                   | Descripción                                                      |
| ------ | -------------------------------------- | ---------------------------------------------------------------- |
| POST   | `/postman-schedules`                   | Crea un schedule para una Suite y lo registra en caliente.       |
| GET    | `/postman-schedules`                   | Lista, filtrable por `?suiteId=`/`?projectId=`/`?isActive=`.     |
| PATCH  | `/postman-schedules/:id`               | Edita cron/timezone/isActive; re-registra la tarea en caliente.  |
| DELETE | `/postman-schedules/:id`               | Elimina el schedule y des-registra su tarea cron.                |
| POST   | `/execution/automation-runs/:id/retry` | Reintenta una corrida (misma Suite y misma versión de archivos). |

## Historial y auditoría (Etapa 8 — `docs/postman-runner/`)

Casi todo esto ya existía: `AutomationRun` ya es un historial append-only (nunca se sobreescribe),
`GET /execution/automation-runs` ya soportaba filtros por `projectId`/`tool`/fecha. Lo nuevo es
poder filtrar ese historial por Suite y comparar dos corridas para detectar regresiones.

- **`GET /execution/automation-runs?postmanSuiteId=`**: mismo controlador, un filtro más — deja
  traer el historial completo de una Suite puntual sin tener que filtrar del lado del cliente.
- **`GET /postman-suites/:id/compare?runA=&runB=`**: sin `runA`/`runB`, compara las dos corridas más
  recientes de esa Suite (`runB` = la más nueva, `runA` = la anterior); si se pasan explícitos, ambos
  deben pertenecer a esa misma Suite (si no, `400` — comparar corridas de Suites distintas no
  significa nada, son colecciones diferentes). `400` también si no hay al menos dos corridas para
  comparar.
- **`services/compareRuns.service.js#compareRuns`**: el diff en sí, función pura reutilizable (no
  sólo desde este endpoint — también serviría el día que la Etapa 5 quiera mostrar la comparación en
  el PDF/HTML, sin duplicar la lógica). Empareja resultados por `` `${suiteName}::${testName}` ``, no
  sólo por `testName` — Newman puede tener el mismo nombre de request repetido en dos carpetas
  distintas (cada carpeta es su propia "suite" para `parseNewmanReport`), y emparejar sólo por
  `testName` los mezclaría. Por cada test que aparece en cualquiera de las dos corridas: `isNew`
  (sólo en B), `isRemoved` (sólo en A), `regression` (pasaba en A, falla/rompe en B), `fixed` (fallaba
  en A, pasa en B).

| Método | Ruta                          | Descripción                                                        |
| ------ | ----------------------------- | ------------------------------------------------------------------ |
| GET    | `/postman-suites/:id/compare` | Diff entre dos corridas de una Suite (`?runA=&runB=`, opcionales). |

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
