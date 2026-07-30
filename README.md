# QualiGuali

Plataforma de gestión de QA (single-tenant): Super Admin / Admin / QA Engineer sobre módulos de
Proyectos, Requerimientos, Módulos, Casos de prueba, Planes, Ciclos de ejecución, Defectos,
Reportes, Usuarios y Automatización (UI y API). Arquitectura de microservicios sobre AWS, todos
apuntando a una única base MongoDB compartida (`qualiguali`) con colecciones prefijadas por
servicio. Ver `QualiGuali_Arquitectura_v1.2.md` y `QualiGuali_Roadmap_Implementacion.md` para el
diseño completo.

## Índice

- [Estructura del repo](#estructura-del-repo)
- [Arquitectura en un vistazo](#arquitectura-en-un-vistazo)
- [Requisitos](#requisitos)
- [Puesta en marcha — paso a paso](#puesta-en-marcha--paso-a-paso)
  - [Opción A: con Docker](#opción-a-con-docker)
  - [Opción B: sin Docker (procesos locales)](#opción-b-sin-docker-procesos-locales)
- [Comandos útiles](#comandos-útiles)
- [Documentación funcional por módulo](#documentación-funcional-por-módulo)
- [Roles y permisos](#roles-y-permisos)
- [Notas operativas / troubleshooting](#notas-operativas--troubleshooting)
- [Estado del proyecto](#estado-del-proyecto)

## Estructura del repo

```
qualiguali/
├── docs/
│   └── RUNBOOK.md             # Debug de un servicio individual, AWS (secretos/logs), CI/CD
├── apps/
│   └── web/                   # Frontend React (shell, i18n, tema, pantallas, dashboard)
├── services/
│   ├── auth-service/          # Usuarios, login, roles, JWT
│   ├── projects-service/      # Proyectos y Módulos funcionales
│   ├── qa-core-service/       # Requerimientos, Plantillas, Suites, Casos y Planes de prueba
│   ├── execution-service/     # Ejecución manual (evidencia en S3/MinIO) + ingesta Allure/Newman
│   ├── defects-service/       # Defectos y comentarios
│   └── reports-service/       # Dashboard/reportes unificados (consumer de eventos + read-model)
├── packages/
│   └── shared/                 # JWT/RBAC/errorHandler/CORS/eventos/contador compartidos, config ESLint/Prettier
├── infra/
│   └── localstack-init.sh     # Crea el topic SNS + cola SQS al levantar LocalStack (solo con Docker)
├── scripts/
│   └── e2e-smoke.js           # Smoke test manual del flujo completo contra servicios reales
├── pnpm-workspace.yaml
├── .env.example                # Overrides compartidos de docker-compose.yml (JWT, S3, CORS, etc.)
├── docker-compose.yml          # Mongo + MinIO + LocalStack + los 6 servicios backend + web
└── .github/workflows/          # CI (lint+test por paquete afectado) + deploy (ECR + EC2 dev/prod)
```

## Arquitectura en un vistazo

Cada servicio es independiente (su propio `package.json`, tests, `.env`), pero todos comparten una
sola base Mongo (`qualiguali`) — sin API Gateway: el frontend le pega directo a cada uno por su
puerto. La comunicación entre servicios es HTTP síncrono (ej. `defects-service` valida un
`projectId` contra `projects-service`) más eventos de dominio asíncronos (`ExecutionUpdated`,
`DefectCreated`, etc.) que `reports-service` consume para armar su read-model.

| Servicio            | Puerto | Responsabilidad                                                         |
| ------------------- | ------ | ----------------------------------------------------------------------- |
| `auth-service`      | 4000   | Login, JWT, alta/edición de usuarios y roles                            |
| `projects-service`  | 4001   | Proyectos, Módulos funcionales                                          |
| `qa-core-service`   | 4002   | Requerimientos, Plantillas de caso, Suites, Casos y Planes de prueba    |
| `execution-service` | 4003   | Ciclos de ejecución, ejecución manual, evidencia, ingesta Allure/Newman |
| `defects-service`   | 4004   | Defectos, comentarios, transición de estado                             |
| `reports-service`   | 4005   | Reportes/dashboard: consume eventos de los demás servicios              |
| `apps/web` (Vite)   | 5173   | Frontend — React 18, CSS Modules, sin librería de UI ni Tailwind        |

Todos los servicios backend verifican el JWT **localmente** (sin round-trip a `auth-service`), así
que **`JWT_SECRET` tiene que ser idéntico en el `.env` de los 6 servicios** — es la causa más común
de "401 en un servicio sí y en otro no" si algo no arranca bien.

## Requisitos

- Node.js >= 20
- pnpm (`npm install -g pnpm` si no lo tenés)
- **Una de estas dos** para la infraestructura (Mongo + almacenamiento de archivos):
  - Docker + Docker Compose (recomendado si lo tenés disponible — levanta todo con un comando), **o**
  - MongoDB Community + MinIO instalados localmente (ver [Opción B](#opción-b-sin-docker-procesos-locales) — es el camino probado en este entorno, donde Docker no está instalado)

## Puesta en marcha — paso a paso

### Opción A: con Docker

```bash
cp .env.example .env        # ajustar si hace falta; los defaults ya funcionan
docker-compose up --build
```

Esto levanta, en este orden de dependencias:

1. `mongo` — única instancia, base compartida `qualiguali`.
2. `minio` — S3-compatible, para evidencias y reportes crudos de automatización.
3. `localstack` — simula SNS/SQS; `infra/localstack-init.sh` crea el topic y la cola al arrancar.
4. Los 6 servicios backend.
5. `web` — frontend Vite (5173), apunta a los 6 servicios anteriores vía `localhost`.

Crear el Super Admin inicial (no existe vía API, solo por seed):

```bash
docker-compose exec auth-service pnpm seed
```

Para descartar estado previo (ej. antes de validar que todo levanta desde cero):

```bash
docker-compose down -v      # -v también borra los volúmenes (Mongo, MinIO, LocalStack)
docker-compose up --build
```

Ver [`docs/RUNBOOK.md`](docs/RUNBOOK.md) §2 para debuggear un servicio individual (con breakpoints,
fuera del contenedor) mientras el resto sigue en `docker-compose`.

### Opción B: sin Docker (procesos locales)

Sin LocalStack, los eventos de dominio (`ExecutionUpdated`, `DefectCreated`, etc.) no tienen SNS/SQS
al que publicarse — cada servicio productor cae automáticamente a un modo de entrega HTTP local
directo a `reports-service` si le seteás `EVENTS_LOCAL_HTTP_URLS` (ver más abajo), o si no, sigue
funcionando igual pero solo logueando el evento (el dashboard de Reportes no se actualiza solo).

1. **Instalar y levantar MongoDB** (ejemplo con Homebrew en macOS):

   ```bash
   brew tap mongodb/brew
   brew install mongodb-community
   brew services start mongodb-community
   ```

2. **Instalar y levantar MinIO** (almacena evidencia de ejecuciones y reportes crudos de
   automatización):

   ```bash
   brew install minio
   minio server ~/minio-data --address :9000 --console-address :9001
   ```

   Con las credenciales default (`minioadmin` / `minioadmin`, ver cada `.env.example`), no hace
   falta crear el bucket a mano — cada servicio que lo usa lo crea (y le aplica una política de
   lectura pública, necesaria para que las imágenes de evidencia se vean en el navegador) al
   arrancar.

3. **Copiar el `.env.example` de cada servicio a `.env`** (los defaults ya apuntan a `localhost`,
   pensados exactamente para este caso):

   ```bash
   for s in auth-service projects-service qa-core-service execution-service defects-service reports-service; do
     cp services/$s/.env.example services/$s/.env
   done
   cp apps/web/.env.example apps/web/.env
   ```

   **Importante**: `JWT_SECRET` viene igual (`change-me-in-every-environment`) en los 6 — si lo
   cambiás en uno, cambialo en todos, o todo login empieza a fallar con 401 en el servicio que
   quedó desalineado.

4. **Instalar dependencias e inicializar el Super Admin**:

   ```bash
   pnpm install
   pnpm --filter auth-service seed
   ```

   Credenciales por defecto (definidas en `services/auth-service/.env.example`, cambiables ahí):
   `super.admin@qualiguali.local` / `change-me`.

5. **Levantar los 6 servicios backend** (cada uno en su propia terminal/proceso — no hay un script
   único que los levante a todos juntos fuera de Docker):

   ```bash
   pnpm --filter auth-service dev        # :4000
   pnpm --filter projects-service dev    # :4001
   pnpm --filter qa-core-service dev     # :4002
   pnpm --filter execution-service dev   # :4003
   pnpm --filter defects-service dev     # :4004
   pnpm --filter reports-service dev     # :4005
   ```

6. **Levantar el frontend**:

   ```bash
   pnpm --filter web dev                 # :5173
   ```

7. Entrar a `http://localhost:5173`, loguearse con el Super Admin del paso 4, y desde
   Configuración → Usuarios crear el resto de las cuentas (Admin / QA Engineer).

**Nota**: como cada servicio no tiene hot-reload de `.env` ni de dependencias internas, cualquier
cambio de código en un servicio backend requiere matar y volver a levantar ese proceso puntual —
`pnpm --filter web dev` (Vite) sí tiene hot-reload para el frontend.

## Comandos útiles

```bash
pnpm install              # instala todo el workspace
pnpm lint                 # ESLint en todo el monorepo (incluye apps/web)
pnpm format                # Prettier --write
pnpm test                  # tests de todos los servicios + packages/shared (Jest) + apps/web (Vitest)
pnpm --filter <paquete> test   # tests de un solo servicio/paquete, ej. pnpm --filter defects-service test
pnpm e2e:smoke              # smoke test manual del flujo completo contra servicios reales
pnpm --filter web build     # build de producción del frontend (Vite)
```

Cada paquete tiene su propio README con detalle de endpoints/pantallas y variables de entorno:

- [`services/auth-service/README.md`](services/auth-service/README.md)
- [`services/projects-service/README.md`](services/projects-service/README.md)
- [`services/qa-core-service/README.md`](services/qa-core-service/README.md)
- [`services/execution-service/README.md`](services/execution-service/README.md)
- [`services/defects-service/README.md`](services/defects-service/README.md)
- [`services/reports-service/README.md`](services/reports-service/README.md)
- [`apps/web/README.md`](apps/web/README.md)

## Documentación funcional por módulo

### Dashboard (Home del proyecto)

KPIs generales del proyecto (módulos/requerimientos, casos de prueba, ejecuciones con desglose
pasó/falló/bloqueado/pendiente, defectos abiertos), gráfico de casos de prueba por requerimiento
(barras apiladas por estado), dona de cobertura de requerimientos, y un ranking de módulos con más
fallos.

### Gestión de Proyectos

- **Proyectos**: alta/edición/baja, estado activo/archivado. El selector de proyecto en el header
  (arriba a la izquierda) es el único lugar para entrar o cambiar de proyecto — recuerda el último
  proyecto visitado aunque navegues a una pantalla sin proyecto en la URL (ej. la propia lista de
  Proyectos, o Configuración).
- **Módulos funcionales**: agrupan Requerimientos dentro de un proyecto.
- **Requerimientos**: prioridad, estado (borrador/aprobado/deprecado), y un campo de URL para
  vincular el ticket de Jira correspondiente. Desde el detalle de un requerimiento se crean sus
  Suites de prueba.

### Gestión de Casos de Prueba

- **Suites de prueba**: agrupan Casos de prueba bajo un Requerimiento.
- **Plantillas de caso de prueba**: definen campos custom (texto/número/booleano/selección) que
  después aparecen en el formulario de creación de casos de ese proyecto.
- **Casos de prueba**: formulario completo estilo Kualitee — información general (prioridad,
  estado, tipo de ejecución, tipo de testing), información adicional (build, módulo, escenario,
  tiempo estimado, asignado), precondiciones/pasos/resultado esperado/postcondiciones, campos
  custom de la plantilla, y **dos flags independientes de automatización** ("Automatizado -
  Front/UI" y "Automatizado - API") — un caso puede estar automatizado en ninguna, una o ambas
  capas, sin relación con su `Tipo de ejecución` (que solo indica cómo se corre _hoy_).
  Import/export en CSV con un layout fijo de 19 columnas (17 del template estilo Kualitee más las
  2 columnas de automatización), pensado para ida y vuelta sin remapeo manual.

### Gestión de Ciclos de Prueba

- **Planes de prueba**: agrupan qué Casos de prueba se van a ejecutar.
- **Ciclos de ejecución**: instancia ejecutable de un Plan, con asignado/fechas/prioridad/estado;
  se cierra manualmente (o forzado) cuando termina.
- **Ejecución manual**: cada caso del ciclo se ejecuta desde un drawer con toda su info, un
  historial de intentos previos, y carga de evidencia (imagen/video) con una herramienta de
  anotación (rectángulos/flechas/círculos de distintos colores) antes de subir. Si un caso queda en
  Fail, el mismo drawer tiene un botón para crear el Defecto relacionado sin salir de la pantalla.

### Automatización

Dos sub-módulos, **UI** y **API**, mapeados sobre el mismo dato de fondo (`tool: 'allure' | 'newman'`
de cada corrida) — Allure para reportes de UI/E2E, Newman (Postman) para reportes de API. Cada uno
permite subir un reporte (auto-detecta la herramienta por el contenido del archivo, o se puede
forzar), ver el resumen (total/pasaron/fallaron), la lista de tests fallidos, y el link al reporte
crudo.

### Defectos

Alta manual o automática (desde un caso de ejecución manual fallado, o desde un resultado de
automatización fallado), severidad, estado con flujo controlado (abierto → en curso → resuelto →
cerrado/reabierto), comentarios, y un campo de URL para vincular el ticket de Jira.

### Reportes

Por ciclo de ejecución: métricas de cantidad de casos por estado (pasado/fallado/bloqueado/
pendiente) leídas directo de `execution-service` (no de un caché derivado de eventos, que puede
desincronizarse si se pierde un evento), una barra de distribución interactiva que funciona como
filtro de estado, un listado de casos filtrable que abre el mismo drawer de ejecución (info +
evidencia + defecto relacionado si está en Fail), tendencia de pass rate en el tiempo, tabla de
fallos de automatización por origen, y un botón para descargar un PDF del reporte completo
(generado nativamente, no es una captura de pantalla).

### Configuración

- **General**: idioma (Español/English) y tema (claro/oscuro).
- **Usuarios**: alta/edición/baja, rol (Admin/QA Engineer — Super Admin no se crea por acá) y
  proyectos asignados. Solo visible para Super Admin.

## Roles y permisos

- **Super Admin**: acceso total, incluida la gestión de Usuarios. Se crea únicamente vía
  `pnpm --filter auth-service seed` — no hay endpoint de API para crear uno.
- **Admin**: gestión de Proyectos, y todo lo demás salvo Usuarios.
- **QA Engineer**: operación día a día (Casos de prueba, Ciclos, Defectos, Automatización,
  Reportes) sobre los proyectos que tenga asignados.

## Notas operativas / troubleshooting

- **Cambié un archivo de un servicio backend y no pasa nada**: ningún servicio tiene hot-reload —
  hay que matar el proceso (`pnpm --filter <servicio> dev`) y levantarlo de nuevo. El frontend
  (Vite) sí es hot-reload.
- **401 en un solo servicio**: casi siempre `JWT_SECRET` desalineado entre `.env`s — tiene que ser
  idéntico en los 6 servicios backend.
- **Las imágenes de evidencia no se ven**: confirmá que MinIO esté corriendo (`:9000`) y que el
  servicio que subió el archivo (`execution-service`) haya podido crear/ajustar el bucket al
  arrancar (queda en su log de inicio).
- **El dashboard de Reportes no refleja una ejecución/defecto recién creado**: sin LocalStack
  (SNS/SQS) ni `EVENTS_LOCAL_HTTP_URLS` configurado, los eventos de dominio solo se loguean, no se
  entregan — es el comportamiento esperado en un setup sin Docker que no seteó ese fallback. Ver
  `packages/shared/src/events/publisher.js` para las 3 modalidades soportadas (SNS real, entrega
  HTTP local, o solo log).
- **Rate limit de login**: `auth-service` limita intentos de login fallidos por IP en memoria — se
  resetea reiniciando el proceso.

## Estado del proyecto

El roadmap inicial de 8 partes (scaffold + `auth-service`; `projects-service` + `qa-core-service`;
`execution-service` ejecución manual; `execution-service` ingesta Allure/Newman; `defects-service`;
`reports-service`; `apps/web` frontend; DevOps con `docker-compose.yml`, CI/CD y este runbook) está
completo. Sobre esa base, el producto siguió iterando: rediseño de creación/edición de casos de
prueba estilo Kualitee con import/export CSV, ejecución manual con historial y evidencia anotada,
reportes interactivos por estado con PDF descargable, defectos vinculados a Jira y creables desde
un caso fallado, y automatización separada en sub-módulos UI/API. Lo pendiente de infraestructura
(rotar de EC2+Docker Compose a ECS/EKS, API Gateway real, etc.) queda documentado como
`[DECISIÓN PENDIENTE]` en `docs/RUNBOOK.md` §6.
