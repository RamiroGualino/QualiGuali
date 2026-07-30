# qa-core-service

Servicio de Requerimientos, Suites de prueba, Plantillas de caso de prueba, Casos de prueba y
Planes de prueba de QualiGuali. Se conecta a la base MongoDB compartida `qualiguali` y solo
lee/escribe sus propias colecciones: `qacore_requirements`, `qacore_testSuites`,
`qacore_testCaseTemplates`, `qacore_testCases`, `qacore_testPlans`, `qacore_counters`.

## Jerarquía del dominio QA

```
Proyecto (projects-service) 1─N Módulo (projects-service)
Módulo 1─N Requerimiento
Requerimiento 1─N Suite de prueba
Suite de prueba 1─N Caso de prueba
```

Un `TestCase` pertenece a exactamente una `TestSuite` (`suiteId`, requerido); su vínculo con el
`Requirement` es transitivo a través de la suite (`TestSuite.requirementId`), no un campo directo
en el caso. `GET /requirements/:id/test-cases` resuelve esa cadena completa — lo usa tanto el
frontend (vista de detalle del requerimiento) como `execution-service` para armar un Ciclo de
Prueba "desde Requerimientos" (ver su propio README).

## Auth

Todas las rutas requieren un JWT válido emitido por `auth-service` (`Authorization: Bearer <token>`),
verificado localmente con el mismo `JWT_SECRET`. No hay restricción de rol adicional dentro de este
servicio — cualquier usuario autenticado (Super Admin, Admin o QA Engineer) puede operar sobre
Requerimientos, Plantillas, Casos de prueba y Planes de prueba.

## Endpoints

| Método | Ruta                              | Descripción                                                                                        |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------- |
| POST   | `/requirements`                   | Crea un requerimiento (código `REQ-NNN` auto-generado).                                            |
| GET    | `/requirements`                   | Lista requerimientos (`?projectId=` opcional).                                                     |
| GET    | `/requirements/:id`               | Obtiene un requerimiento.                                                                          |
| PATCH  | `/requirements/:id`               | Actualiza título/descripción/prioridad/estado.                                                     |
| DELETE | `/requirements/:id`               | Elimina un requerimiento (falla con 409 si tiene suites).                                          |
| GET    | `/requirements/:id/test-cases`    | Casos de prueba de todas sus suites (transitivo).                                                  |
| POST   | `/test-suites`                    | Crea una suite de prueba bajo un requerimiento.                                                    |
| GET    | `/test-suites`                    | Lista suites (`?projectId=` y/o `?requirementId=` opcionales).                                     |
| GET    | `/test-suites/:id`                | Obtiene una suite de prueba.                                                                       |
| PATCH  | `/test-suites/:id`                | Actualiza nombre/descripción.                                                                      |
| DELETE | `/test-suites/:id`                | Elimina una suite (falla con 409 si tiene casos de prueba).                                        |
| POST   | `/test-case-templates`            | Crea una plantilla custom.                                                                         |
| GET    | `/test-case-templates?projectId=` | Lista plantillas del proyecto (crea la default si no existe).                                      |
| GET    | `/test-case-templates/:id`        | Obtiene una plantilla.                                                                             |
| PATCH  | `/test-case-templates/:id`        | Actualiza nombre/campos.                                                                           |
| DELETE | `/test-case-templates/:id`        | Elimina una plantilla (la default no se puede borrar).                                             |
| POST   | `/test-cases`                     | Crea un caso de prueba (código `TC-NNN` auto-generado), dentro de una suite (`suiteId` requerido). |
| GET    | `/test-cases`                     | Lista casos de prueba (`?projectId=` y/o `?suiteId=` opcionales).                                  |
| GET    | `/test-cases/:id`                 | Obtiene un caso de prueba.                                                                         |
| PATCH  | `/test-cases/:id`                 | Actualiza título/pasos/customFields/estado.                                                        |
| DELETE | `/test-cases/:id`                 | Elimina un caso de prueba.                                                                         |
| POST   | `/test-plans`                     | Crea un plan de prueba.                                                                            |
| GET    | `/test-plans`                     | Lista planes de prueba (`?projectId=` opcional).                                                   |
| GET    | `/test-plans/:id`                 | Obtiene un plan de prueba.                                                                         |
| PATCH  | `/test-plans/:id`                 | Actualiza nombre/estado.                                                                           |
| DELETE | `/test-plans/:id`                 | Elimina un plan de prueba.                                                                         |
| POST   | `/test-plans/:id/test-cases`      | Agrega casos de prueba existentes (del mismo proyecto) al plan.                                    |

## Reglas de negocio implementadas

- **Código correlativo por proyecto**: `Requirement` y `TestCase` reciben `REQ-001`/`TC-001`, ...
  vía un contador atómico (`qacore_counters`, `findOneAndUpdate` + `$inc`, con reintento ante
  colisión de upsert) — sin condiciones de carrera aun con creaciones concurrentes. Desde la Parte
  5, el algoritmo vive en `@qualiguali/shared` (`nextSequence`/`nextCode`) y se reusa también en
  `defects-service` para los códigos `DEF-NNN`; este servicio sólo mantiene su propio modelo
  `Counter` (colección `qacore_counters`) y un wrapper fino.
- **Plantilla default por proyecto**: en vez de que `projects-service` dispare su creación al crear
  un proyecto (lo que agregaría una nueva dirección de acoplamiento entre servicios, y este roadmap
  todavía no tiene bus de eventos), `qa-core-service` la **crea de forma perezosa** la primera vez
  que hace falta: al listar plantillas de un proyecto, o al crear un `TestCase` sin `templateId`
  explícito. Hay un índice único parcial (`{projectId:1}` con `isDefault:true`) que garantiza que
  nunca se dupliquen aunque dos requests concurrentes disparen la creación a la vez.
- **Validación de `customFields`**: al crear/actualizar un `TestCase`, sus `customFields` se validan
  contra los `fields` de su `TestCaseTemplate` (los `required` deben estar presentes; se valida el
  tipo básico `text`/`number`/`boolean`/`select`). Claves no definidas en la plantilla se ignoran.
- **Validación cruzada con projects-service**: antes de crear un `Requirement`, `TestCaseTemplate`,
  `TestCase` o `TestPlan`, este servicio llama síncronamente a `projects-service`
  (`GET /projects/:id`, `GET /projects/:id/modules/:id`) para confirmar que el proyecto/módulo
  existen. Se reenvía el mismo `Authorization` header del request original (projects-service exige
  JWT en todas sus rutas, incluidas las de lectura).
- **Integridad referencial dentro del dominio QA**: un `TestSuite` sólo puede crearse bajo un
  `Requirement` que exista y pertenezca al mismo `projectId`; un `TestCase` sólo puede crearse bajo
  un `TestSuite` que exista y pertenezca al mismo `projectId` (ambas validaciones son consultas
  directas a Mongo, no HTTP — viven en la misma base). Borrar un `Requirement` con suites, o un
  `TestSuite` con casos de prueba, responde `409` en vez de dejar huérfanos.

## Correr en local

```bash
# desde la raíz del monorepo
pnpm install

cd services/qa-core-service
cp .env.example .env   # completar JWT_SECRET (mismo valor que auth-service/projects-service)

pnpm start              # o `pnpm dev`
```

Requiere `projects-service` corriendo y alcanzable en `PROJECTS_SERVICE_URL`. Con Docker Compose
desde la raíz (`docker-compose up`) se levantan Mongo, `auth-service`, `projects-service` y
`qa-core-service` juntos, ya cableados entre sí.

### Prueba de punta a punta manual (contra servicios reales)

```bash
docker-compose up -d
# o corriendo los tres servicios con `pnpm dev` en paralelo
pnpm --filter auth-service seed   # si todavía no existe el Super Admin
pnpm e2e:smoke                     # desde la raíz del monorepo
```

`scripts/e2e-smoke.js` (raíz del monorepo) ejecuta el flujo completo — crear proyecto → módulo →
requerimiento → plantilla → caso de prueba con `customFields` → plan de prueba — contra los
servicios realmente corriendo (no mockeados), para verificar la validación cruzada HTTP real entre
`qa-core-service` y `projects-service`.

## Variables de entorno

| Variable               | Requerida | Default                                | Descripción                                                 |
| ---------------------- | --------- | -------------------------------------- | ----------------------------------------------------------- |
| `PORT`                 | No        | `4002`                                 | Puerto HTTP del servicio.                                   |
| `NODE_ENV`             | No        | `development`                          | Entorno de ejecución.                                       |
| `MONGODB_URI`          | No        | `mongodb://localhost:27017/qualiguali` | URI de la base compartida (misma para todos los servicios). |
| `JWT_SECRET`           | **Sí**    | —                                      | Debe coincidir con el de `auth-service`/`projects-service`. |
| `PROJECTS_SERVICE_URL` | No        | `http://localhost:4001`                | Base URL de `projects-service` para la validación cruzada.  |

## Tests

```bash
cd services/qa-core-service
pnpm test
```

- **Unitarios**: contador correlativo (incluyendo condición de carrera simulada con 25 llamadas
  concurrentes), validación de `customFields` contra una plantilla.
- **Integración**: CRUD completo de cada entidad contra `mongodb-memory-server`, con la llamada a
  `projects-service` mockeada (`jest.mock('../../src/clients/projectsClient')`), incluyendo el flujo
  de punta a punta completo (crear requerimiento → plantilla → caso de prueba con `customFields` →
  plan de prueba).
