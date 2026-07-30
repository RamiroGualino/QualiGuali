# projects-service

Servicio de Proyectos y Módulos funcionales de QualiGuali. Se conecta a la base MongoDB
compartida `qualiguali` y solo lee/escribe sus propias colecciones: `projects_projects` y
`projects_functionalModules`.

## Auth

Todas las rutas requieren un JWT válido emitido por `auth-service` (`Authorization: Bearer <token>`).
El JWT se verifica localmente con el mismo `JWT_SECRET` — no hay round-trip a `auth-service` en
cada request.

## Endpoints

| Método | Ruta                                     | Rol requerido       | Descripción                            |
| ------ | ---------------------------------------- | ------------------- | -------------------------------------- |
| POST   | `/projects`                              | Admin / Super Admin | Crea un proyecto.                      |
| GET    | `/projects`                              | Cualquier rol       | Lista proyectos.                       |
| GET    | `/projects/:projectId`                   | Cualquier rol       | Obtiene un proyecto.                   |
| PATCH  | `/projects/:projectId`                   | Admin / Super Admin | Actualiza nombre/descripción/estado.   |
| DELETE | `/projects/:projectId`                   | Admin / Super Admin | Elimina un proyecto.                   |
| POST   | `/projects/:projectId/modules`           | Admin / Super Admin | Crea un módulo funcional.              |
| GET    | `/projects/:projectId/modules`           | Cualquier rol       | Lista módulos (ordenados por `order`). |
| GET    | `/projects/:projectId/modules/:moduleId` | Cualquier rol       | Obtiene un módulo.                     |
| PATCH  | `/projects/:projectId/modules/:moduleId` | Admin / Super Admin | Actualiza un módulo.                   |
| DELETE | `/projects/:projectId/modules/:moduleId` | Admin / Super Admin | Elimina un módulo.                     |

`GET /projects/:projectId` y `GET /projects/:projectId/modules/:moduleId` también son usados
internamente por `qa-core-service` para validar `projectId`/`moduleId` antes de crear
Requerimientos, Casos de prueba y Planes de prueba.

## Correr en local

```bash
# desde la raíz del monorepo
pnpm install

cd services/projects-service
cp .env.example .env   # completar JWT_SECRET (mismo valor que auth-service), MONGODB_URI

pnpm start              # o `pnpm dev`
```

O con Docker Compose desde la raíz: `docker-compose up` (levanta Mongo, auth-service,
projects-service y qa-core-service juntos).

## Variables de entorno

| Variable      | Requerida | Default                                | Descripción                                                 |
| ------------- | --------- | -------------------------------------- | ----------------------------------------------------------- |
| `PORT`        | No        | `4001`                                 | Puerto HTTP del servicio.                                   |
| `NODE_ENV`    | No        | `development`                          | Entorno de ejecución.                                       |
| `MONGODB_URI` | No        | `mongodb://localhost:27017/qualiguali` | URI de la base compartida (misma para todos los servicios). |
| `JWT_SECRET`  | **Sí**    | —                                      | Debe coincidir con el de `auth-service`.                    |

## Tests

```bash
cd services/projects-service
pnpm test
```

Integración contra `mongodb-memory-server`: CRUD completo de Project y FunctionalModule,
permisos por rol (403 para QA Engineer intentando crear), 401 sin token, 404 para ids
inexistentes o malformados, y aislamiento de módulos entre proyectos distintos.
