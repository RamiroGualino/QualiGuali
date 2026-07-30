# QualiGuali — Documentación técnica

Referencia de stack, dependencias y arquitectura del código actual. Para "cómo levanto esto en mi
máquina" ver el `README.md` de la raíz; para operar en AWS/debug de un servicio individual ver
`docs/RUNBOOK.md`. Para qué hace cada pantalla, ver `docs/DOCUMENTACION_FUNCIONAL.md`.

## Índice

- [Panorama general](#panorama-general)
- [Monorepo: estructura de carpetas](#monorepo-estructura-de-carpetas)
- [Frontend (`apps/web`)](#frontend-appsweb)
- [Paquete compartido (`packages/shared`)](#paquete-compartido-packagesshared)
- [Servicios backend](#servicios-backend)
  - [auth-service](#auth-service)
  - [projects-service](#projects-service)
  - [qa-core-service](#qa-core-service)
  - [execution-service](#execution-service)
  - [defects-service](#defects-service)
  - [reports-service](#reports-service)
- [Base de datos](#base-de-datos)
- [Almacenamiento de archivos (S3/MinIO)](#almacenamiento-de-archivos-s3minio)
- [Autenticación y autorización](#autenticación-y-autorización)
- [Eventos de dominio (comunicación asíncrona)](#eventos-de-dominio-comunicación-asíncrona)
- [Generación de reportes PDF](#generación-de-reportes-pdf)
- [Import/export de planillas](#importexport-de-planillas)
- [Testing](#testing)
- [Lint y formato](#lint-y-formato)
- [Infraestructura y despliegue](#infraestructura-y-despliegue)

## Panorama general

- **Monorepo** gestionado con **pnpm workspaces** (`pnpm-workspace.yaml`: `apps/*`, `services/*`,
  `packages/*`).
- **Arquitectura de microservicios**: 6 servicios Node.js/Express independientes (código, tests y
  despliegue por separado), todos apuntando a una **única base MongoDB compartida** (`qualiguali`),
  con colecciones prefijadas por servicio (`auth_*`, `projects_*`, `qacore_*`, `execution_*`,
  `defects_*`, `reports_*`). Sin API Gateway — el frontend le pega directo a cada servicio por su
  puerto.
- **Frontend**: SPA en React 18, sin librería de componentes ni Tailwind — todo CSS Modules a mano.
- **JavaScript puro en todo el repo** — sin TypeScript en ningún paquete.
- **Comunicación entre servicios**: HTTP síncrono cuando un servicio necesita validar algo de otro
  en el momento (ej. `defects-service` valida `projectId` contra `projects-service`), más eventos
  de dominio asíncronos (`ExecutionUpdated`, `DefectCreated`, etc.) que `reports-service` consume
  para armar su read-model — ver [Eventos de dominio](#eventos-de-dominio-comunicación-asíncrona).

## Monorepo: estructura de carpetas

```
qualiguali/
├── apps/
│   └── web/                    # Frontend React (Vite)
├── services/
│   ├── auth-service/           # :4000 — usuarios, login, JWT, roles
│   ├── projects-service/       # :4001 — proyectos, módulos funcionales
│   ├── qa-core-service/        # :4002 — requerimientos, plantillas, suites, casos, planes
│   ├── execution-service/      # :4003 — ciclos, ejecución manual, evidencia, ingesta Allure/Newman
│   ├── defects-service/        # :4004 — defectos, comentarios, evidencia
│   └── reports-service/        # :4005 — dashboard/reportes (consumer de eventos)
├── packages/
│   └── shared/                 # @qualiguali/shared — JWT/RBAC/CORS/errorHandler/eventos/contador
├── infra/
│   └── localstack-init.sh      # Crea el topic SNS + cola SQS al levantar LocalStack
├── scripts/
│   └── e2e-smoke.js            # Smoke test manual del flujo completo
├── docs/
│   ├── RUNBOOK.md
│   ├── DOCUMENTACION_FUNCIONAL.md
│   └── DOCUMENTACION_TECNICA.md
├── docker-compose.yml           # Mongo + MinIO + LocalStack + 6 servicios + web
├── pnpm-workspace.yaml
├── eslint.config.js              # Config única de ESLint para todo el monorepo
├── .prettierrc.js
└── .github/workflows/            # CI (lint + test) y deploy (ECR + EC2)
```

Cada servicio y `apps/web` tiene su propio `package.json`, `.env.example`, tests y (los backends)
`README.md` con el detalle de sus endpoints.

## Frontend (`apps/web`)

| Aspecto              | Detalle                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Framework            | React 18                                                                                                                                |
| Build tool           | Vite                                                                                                                                    |
| Ruteo                | react-router-dom v7                                                                                                                     |
| Server state / cache | `@tanstack/react-query` (todas las llamadas a los 6 servicios pasan por acá — sin Redux ni Context para datos de servidor)              |
| Estilos              | CSS Modules puro (`*.module.css`) — **sin** Tailwind ni librería de componentes de UI                                                   |
| i18n                 | `react-i18next` — Español/English, `apps/web/src/i18n/locales/{es,en}.json`                                                             |
| Gráficos             | `recharts` (dashboard, tendencia de reportes)                                                                                           |
| PDF                  | `jspdf` + `jspdf-autotable` (generación nativa, no captura de pantalla — ver [Generación de reportes PDF](#generación-de-reportes-pdf)) |
| Excel                | `xlsx` (SheetJS) — import/export real de `.xlsx`, ver [Import/export de planillas](#importexport-de-planillas)                          |
| Testing unitario     | Vitest + Testing Library (`jsdom`)                                                                                                      |
| Testing E2E          | `@playwright/test` (`pnpm --filter web e2e`)                                                                                            |

Estructura de `apps/web/src/`:

```
api/          # Un cliente por servicio backend (auth.api.js, users.api.js, projects.api.js,
              # qaCore.api.js, execution.api.js, defects.api.js, reports.api.js) + httpClient.js
              # (fetch wrapper con JWT automático) + authStore.js + config.js (URLs base por env var)
auth/         # AuthContext, ProtectedRoute
layout/       # AppShell + Sidebar + ProjectSwitcher + Topbar (sidebar, selector de proyecto, header)
theme/        # ThemeContext (claro/oscuro)
i18n/         # Config de i18next + locales/{es,en}.json
hooks/        # useSearchAndPaginate (búsqueda+paginación client-side compartida por casi
              # todos los listados — ningún endpoint de listado soporta aún paginación server-side);
              # useCurrentProjectId (persiste el proyecto actual en localStorage para que
              # Sidebar/ProjectSwitcher no lo pierdan al navegar a pantallas sin :projectId en la URL)
utils/        # csv.js, spreadsheet.js (SheetJS), reportPdf.js, executions.js, testCaseSteps.js
components/   # ~56 componentes reutilizables (Button, Modal, Table, Dropzone, Combobox,
              # ImageAnnotator, StatusBadge, ExpandableText, ExecutionDrawerContent,
              # CycleQuickExecutionModal, etc.)
pages/        # Una por pantalla — ver router.jsx para el mapa completo de rutas
router.jsx    # Todas las rutas de la app (con ProtectedRoute + AppShell envolviendo todo
              # salvo /login)
```

Convenciones a tener en cuenta si se toca este código:

- Ningún componente usa una librería de UI (Material, Ant, etc.) ni Tailwind — todo estilo va en un
  `.module.css` al lado del componente/página.
- Los "campos internos que no debe ver el usuario" (ej. el `code` autogenerado de un caso de
  prueba, `TC-XXX`) nunca se muestran en pantalla ni en PDF — el usuario siempre ve su propio
  `testCaseId`/nombre; el código interno solo existe para orden/unicidad en Mongo
  (`utils/executions.js` → `formatCaseLabel`, `codeNumber`).
- Un componente con Unicode fuera de WinAnsi (✓, ✗, ≠, →, flechas, emoji) **rompe** el PDF con
  `jspdf` si se le pasa tal cual — `utils/reportPdf.js` sanitiza esos casos conocidos
  (`stripLatexArtifacts`) antes de dibujar cualquier texto.

## Paquete compartido (`packages/shared`)

`@qualiguali/shared`, consumido por los 6 servicios backend (no por `apps/web`):

| Módulo                       | Qué resuelve                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `middleware/auth.js`         | `createAuthenticate(jwtSecret)` — verifica el JWT **localmente** (sin round-trip a `auth-service`) en cada request; `requireRole(...roles)` — guard de autorización por rol. |
| `middleware/cors.js`         | `createCors()` — config de CORS compartida.                                                                                                                                  |
| `middleware/errorHandler.js` | `notFoundHandler`, `createErrorHandler` — manejo uniforme de 404 y errores no controlados.                                                                                   |
| `constants/roles.js`         | `ROLES`, `ROLE_VALUES` — enum de roles compartido.                                                                                                                           |
| `events/publisher.js`        | `createEventPublisher(source)` — ver [Eventos de dominio](#eventos-de-dominio-comunicación-asíncrona).                                                                       |
| `events/baseEvent.js`        | `createDomainEvent` — shape común (`eventId`, `type`, `source`, `payload`, `occurredAt`) de todo evento publicado.                                                           |
| `utils/counter.js`           | `nextSequence`/`nextCode` — contador atómico en Mongo para generar códigos correlativos (`TC-001`, `REQ-001`, `DEF-001`, etc.) sin colisiones entre requests concurrentes.   |
| `utils/logger.js`            | Logger JSON estructurado compartido.                                                                                                                                         |

## Servicios backend

Todos comparten el mismo patrón: Express + Mongoose, JWT verificado localmente vía
`@qualiguali/shared`, Jest + Supertest + `mongodb-memory-server` para tests (sin Mongo real en CI),
`node --watch` para dev (sin hot-reload real — hay que reiniciar el proceso ante cualquier cambio).

### auth-service — `:4000`

- **Modelo**: `User` (email, password hasheado con `bcrypt`, rol, `assignedProjectIds`, activo).
- **Responsabilidad**: login (emite el JWT que todos los demás servicios verifican), alta/edición/
  baja de usuarios, roles.
- Dependencias propias: `bcrypt`, `jsonwebtoken`, `express-rate-limit` (limita intentos de login
  fallidos por IP, en memoria — se resetea al reiniciar el proceso).
- El Super Admin **no** tiene endpoint de creación — solo por `pnpm --filter auth-service seed`
  (`src/scripts/seedSuperAdmin.js`).

### projects-service — `:4001`

- **Modelos**: `Project`, `FunctionalModule`.
- **Responsabilidad**: CRUD de Proyectos y de Módulos funcionales dentro de un proyecto.

### qa-core-service — `:4002`

- **Modelos**: `Requirement`, `TestSuite`, `TestCase`, `TestCaseTemplate`, `TestPlan`, más
  `Counter` (contador compartido para los códigos correlativos `REQ-XXX`/`TC-XXX`).
- **Responsabilidad**: todo lo relacionado a definir _qué_ se va a probar — Requerimientos, Suites,
  Casos de prueba (con su formulario extenso estilo Kualitee, campos custom vía plantilla, y los
  dos flags independientes de automatización UI/API), Planes de prueba, y las Plantillas de caso de
  prueba que definen campos custom por proyecto.
- El campo `testCaseId` (identificador externo/importado) es distinto de `code` (interno,
  autogenerado, `TC-XXX`) — ver la nota en [Frontend](#frontend-appsweb).

### execution-service — `:4003`

- **Modelos**: `ExecutionCycle`, `Execution` (mirror del intento más reciente), `ExecutionHistory`
  (log append-only de cada intento), `Evidence` (imagen/video, asociada a un `ExecutionHistory` vía
  `executionHistoryId`), más `AutomationRun`/`AutomationTestResult` (ingesta Allure/Newman).
- **Responsabilidad**:
  - Ciclos de ejecución: instancia ejecutable de un Plan sobre una Suite.
  - Ejecución manual: registrar resultado (pass/fail/blocked), mantener el historial completo de
    intentos (no solo el último), y evidencia (subida a S3/MinIO — ver más abajo) asociada al
    intento correcto.
  - Ingesta de reportes Allure (UI/E2E) y Newman/Postman (API) — sube el archivo crudo a S3/MinIO,
    parsea el resumen (total/pasaron/fallaron) y la lista de tests, uno por uno.
- Publica `ExecutionUpdated` (cada cambio de resultado) y `AutomationRunIngested` — ver
  [Eventos de dominio](#eventos-de-dominio-comunicación-asíncrona).
- Único servicio (junto con `defects-service`) que depende de `@aws-sdk/client-s3` (evidencia +
  reportes crudos) y `multer` (multipart upload).

### defects-service — `:4004`

- **Modelos**: `Defect`, `DefectComment`, `DefectEvidence`, `Counter`.
- **Responsabilidad**: alta (manual o disparada desde un caso de ejecución fallado, vía llamada del
  frontend con la data ya armada — no hay acoplamiento directo entre servicios acá), estado con
  máquina de transición controlada (`open → in_progress → resolved → closed/reopened`), evidencia
  (mismo patrón S3/MinIO que `execution-service`), comentarios.
- Publica `DefectCreated`/`DefectStatusChanged` (nombres exactos en el código del servicio) que
  `reports-service` consume.
- Valida `projectId` contra `projects-service` vía HTTP síncrono al crear un defecto.

### reports-service — `:4005`

- **Modelos** (todos son **read-model derivado**, no fuente de verdad): `ExecutionIndex`,
  `AutomationRunIndex`, `FailedTest`, `TrendPoint`, `CycleReport`, `ProcessedEvent` (idempotencia —
  evita reprocesar el mismo evento dos veces si SQS lo redelivera).
- **Responsabilidad**: consumir los eventos de dominio publicados por `execution-service` y
  `defects-service` (vía SQS, o vía el fallback HTTP local — ver
  [Eventos de dominio](#eventos-de-dominio-comunicación-asíncrona)) y mantener actualizado el
  read-model que alimenta el Dashboard y la pantalla de Reportes.
- **Importante**: el reporte por ciclo (`ReportsDashboardPage`) lee las métricas de cantidad de
  casos por estado **en vivo directo de `execution-service`**, no de este read-model — justamente
  para no quedar desincronizado si se perdió algún evento. El read-model de acá se usa para
  tendencia histórica y fallos de automatización, que sí toleran ser "eventual".
- Único servicio que depende de `@aws-sdk/client-sqs` (consumer) y de `jsonwebtoken` directamente
  (emite su propio token de servicio para llamar a otros servicios — `issueServiceToken`, mismo
  mecanismo que `createEventPublisher` usa para el fallback HTTP local).

## Base de datos

- **MongoDB**, una sola instancia/base (`qualiguali`) compartida por los 6 servicios.
- Cada servicio solo lee/escribe sus propias colecciones (prefijo por servicio) — no hay accesos
  cruzados de datos ni JOINs entre servicios; cualquier relación entre entidades de servicios
  distintos (ej. `Execution.testCaseId` referenciando un `TestCase` de `qa-core-service`) es una
  **referencia lógica** (guardás el ID, no hay FK física), resuelta con una llamada HTTP síncrona
  cuando hace falta validarla, o con datos duplicados/denormalizados cuando alcanza con eso.
- Códigos correlativos (`TC-001`, `REQ-001`, `DEF-001`) se generan con un `Counter` atómico
  (`packages/shared/src/utils/counter.js`, `findOneAndUpdate` con `$inc`) — no hay condición de
  carrera entre requests concurrentes.
- ODM: **Mongoose** en los 6 servicios.

## Almacenamiento de archivos (S3/MinIO)

- `execution-service` y `defects-service` suben archivos (evidencia de ejecuciones/defectos,
  reportes crudos de Allure/Newman) a un bucket S3-compatible vía `@aws-sdk/client-s3`.
- En desarrollo local, ese bucket lo sirve **MinIO** (`docker-compose.yml`, o instalado a mano —
  ver README). El bucket se crea automáticamente al arrancar el servicio si no existe, con una
  política de lectura pública (necesaria para que las imágenes de evidencia se vean directo en el
  navegador sin firmar URLs).
- `multer` (memoria, no disco) es el middleware de multipart upload en ambos servicios.

## Autenticación y autorización

- **JWT stateless**, verificado **localmente** en cada uno de los 6 servicios backend
  (`createAuthenticate` de `@qualiguali/shared`) — ningún request hace round-trip a `auth-service`
  para validar un token.
- Consecuencia directa: **`JWT_SECRET` tiene que ser idéntico en el `.env` de los 6 servicios** — es
  la causa más común de "401 en un servicio sí y en otro no".
- Autorización por rol vía `requireRole(...roles)`, mismo paquete compartido.
- El frontend guarda el JWT (ver `apps/web/src/api/authStore.js`) y lo manda como
  `Authorization: Bearer <token>` en cada request (`httpClient.js`).

## Eventos de dominio (comunicación asíncrona)

`packages/shared/src/events/publisher.js` (`createEventPublisher`) soporta **3 modalidades**,
elegidas automáticamente según qué variables de entorno estén configuradas:

1. **SNS real** — si `SNS_TOPIC_ARN` está seteado, publica al topic (AWS real, o LocalStack en
   local con Docker). `reports-service` consume desde su cola SQS suscripta a ese topic.
2. **Entrega HTTP local** — si `EVENTS_LOCAL_HTTP_URLS` está seteado (URLs separadas por coma), sin
   SNS configurado, cada evento se manda por POST directo a `<url>/internal/events` de cada
   listener (con un JWT de servicio de corta duración, mismo secreto compartido). Pensado para
   correr sin Docker/LocalStack.
3. **Solo log** — si no hay ninguna de las dos, el evento se loguea nomás y no se entrega a nadie
   (el Dashboard de Reportes no se actualiza solo en este modo, salvo por lo que
   `reports-service` lee en vivo de `execution-service`).

Eventos conocidos: `ExecutionUpdated` (execution-service), `AutomationRunIngested`
(execution-service), `DefectCreated`/`DefectStatusChanged` (defects-service). `reports-service` los
consume, actualiza su read-model, y guarda cada `eventId` procesado en `ProcessedEvent` para
descartar duplicados si SQS lo redelivera.

## Generación de reportes PDF

`apps/web/src/utils/reportPdf.js` — PDF nativo (texto real + formas vectoriales dibujadas con
`jspdf`/`jspdf-autotable`), no una captura de pantalla del DOM. Puntos a tener en cuenta si se
edita:

- **Sanitización de texto obligatoria**: cualquier string que llegue de datos de usuario pasa por
  `text()`/`safeText()` antes de `doc.text(...)` — reemplaza `→`/`≠`/`✓`/`✗`/delimitadores LaTeX
  (`$...$`) por equivalentes ASCII seguros, porque un glyph que la fuente estándar de `jspdf`
  (WinAnsi/cp1252) no tiene **corrompe el cálculo de ancho de todo el string**, no solo ese
  caracter — se ve como texto con espaciado roto/superpuesto a lo que esté al lado.
- Una sola fuente (`helvetica`, la que trae `jspdf` por defecto) en todo el documento — no hay
  fuentes custom embebidas (requeriría un archivo de fuente en base64 que no está en el repo).
- Cada caso de prueba se renderiza en su propia hoja (`doc.addPage()` antes de cada uno) —
  compartir hoja con el dashboard/tabla resumen de arriba, o entre casos, dejaba muy poco margen y
  las secciones de un caso terminaban partiéndose solas entre dos hojas.
- Las tarjetas de historial de ejecución (borde redondeado) se dibujan _después_ de su contenido,
  midiendo la altura real ya renderizada — si el contenido de una tarjeta cruzó una hoja en el
  medio (`ensureSpace` disparó un salto de página), se omite el borde de esa tarjeta en particular
  en vez de dibujar un rectángulo corrupto a caballo entre dos hojas.
- Las fotos de evidencia se dibujan dentro de un "marco" de tamaño uniforme
  (`EVIDENCE_FRAME_WIDTH`/`HEIGHT`) — la imagen se escala para _entrar_ dentro del marco
  manteniendo proporción (nunca se recorta ni se deforma), centrada.

## Import/export de planillas

Dos utilidades separadas en `apps/web/src/utils/`:

- **`csv.js`** — CSV hecho a mano (sin dependencia), parser+writer RFC4180-ish. Ya no lo usa
  ninguna pantalla activamente (Casos de prueba migró a Excel real), pero queda disponible.
- **`spreadsheet.js`** — wrapper sobre `xlsx` (SheetJS): `parseSpreadsheetFile(file)` lee
  cualquier formato que SheetJS entienda (`.xlsx`, `.xls`, `.csv`, `.ods`) y lo normaliza a
  `{ headers, records }`; `downloadSpreadsheetRows(filename, headers, rows)` y
  `downloadSpreadsheetTemplate(filename, headers)` escriben un `.xlsx` real (no un CSV con
  extensión cambiada).

Tres flujos de import/export en la app, todos sobre `spreadsheet.js`:

1. **Casos de prueba** (`TestCasesPage`) — layout fijo de 19 columnas (formato Kualitee + 2 propias
   de automatización), pensado para ida y vuelta exacta.
2. **Transformador de Excel** (`ExcelTransformerPage`) — layout libre con mapeo manual de columnas,
   para archivos que no vienen en el formato de la app.
3. **Plantilla en blanco** (`TestCaseTemplatesPage`) — solo exporta (columnas configurables), para
   compartir y after importar por el Transformador de Excel.

## Testing

| Paquete                                     | Framework                | Notas                                                                                                                                        |
| ------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Los 6 servicios backend + `packages/shared` | Jest + Supertest         | `mongodb-memory-server` — cada test levanta un Mongo real en memoria, sin mockear el driver. `pnpm --filter <servicio> test` corre uno solo. |
| `apps/web`                                  | Vitest + Testing Library | `pnpm --filter web test`                                                                                                                     |
| `apps/web` (E2E)                            | Playwright               | `pnpm --filter web e2e` — no corre en CI por defecto, es para verificación manual.                                                           |
| Todo el repo                                | —                        | `pnpm test` desde la raíz corre el test de cada paquete que lo tenga (`pnpm -r --if-present run test`).                                      |

`scripts/e2e-smoke.js` — smoke test manual (no es parte de la suite de Jest/Vitest) que ejercita el
flujo completo contra los servicios reales corriendo (`pnpm e2e:smoke`).

## Lint y formato

- **ESLint** — una única config en la raíz (`eslint.config.js`, flat config) para todo el monorepo,
  incluido `apps/web`. `pnpm lint` desde la raíz corre todo; cada paquete también tiene su propio
  `pnpm --filter <paquete> lint`.
- **Prettier** — `.prettierrc.js` en la raíz, `.prettierignore` para excluir lo que no debe
  reformatearse. `pnpm format` (escribe) / `pnpm format:check` (solo valida, usado en CI).
- CI (`.github/workflows/`) corre lint + test por paquete afectado en cada push/PR.

## Infraestructura y despliegue

- **Desarrollo local**: `docker-compose.yml` levanta Mongo, MinIO, LocalStack (simula SNS/SQS) y
  los 6 servicios + el frontend, en ese orden de dependencias. Alternativa sin Docker: instalar
  Mongo/MinIO a mano y levantar cada proceso con `pnpm --filter <paquete> dev` (ver README, sección
  "Opción B").
- **CI/CD**: GitHub Actions — build/push a ECR y deploy a instancias EC2 (dev/prod). El diseño
  apunta a mover esto a ECS/EKS + API Gateway real más adelante — documentado como
  `[DECISIÓN PENDIENTE]` en `docs/RUNBOOK.md` (todavía no implementado).
- Variables de entorno: cada paquete tiene su propio `.env.example` — la única que **tiene que
  coincidir exactamente** entre los 6 backends es `JWT_SECRET` (ver
  [Autenticación y autorización](#autenticación-y-autorización)).
