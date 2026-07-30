# auth-service

Servicio de autenticación de QualiGuali. Plataforma single-tenant: no hay entidad `Client`,
todos los usuarios comparten un único espacio de trabajo. Se conecta a la base MongoDB
compartida `qualiguali` y solo lee/escribe su propia colección: `auth_users`.

## Endpoints

| Método | Ruta             | Auth                  | Descripción                                                                                     |
| ------ | ---------------- | --------------------- | ----------------------------------------------------------------------------------------------- |
| POST   | `/auth/login`    | —                     | Valida credenciales, devuelve JWT `{ userId, role, exp }`.                                      |
| POST   | `/auth/register` | JWT + rol Super Admin | Crea un Admin o un QA Engineer (nadie puede crear otro Super Admin).                            |
| GET    | `/auth/me`       | JWT                   | Devuelve el usuario autenticado.                                                                |
| POST   | `/auth/refresh`  | —                     | **No implementado.** Devuelve `501` con un mensaje TODO explícito.                              |
| GET    | `/users`         | JWT + rol Super Admin | Lista todos los usuarios.                                                                       |
| POST   | `/users`         | JWT + rol Super Admin | Crea un Admin o un QA Engineer (con `name`, y opcionalmente `assignedProjectIds`).              |
| PATCH  | `/users/:userId` | JWT + rol Super Admin | Edita `name`/`role`/`isActive`/`assignedProjectIds`. No permite tocar la cuenta de Super Admin. |
| DELETE | `/users/:userId` | JWT + rol Super Admin | Soft-delete (`isActive = false`). No permite eliminar la cuenta de Super Admin.                 |

`assignedProjectIds` se valida contra `projects-service` (mismo patrón síncrono que usa
`qa-core-service` para `projectId`) pero, por ahora, es solo informativo/organizativo — no
restringe qué proyectos ve o puede operar cada usuario en el resto de la app.

## Correr en local

### Opción 1 — Docker Compose (recomendado)

Desde la raíz del monorepo:

```bash
docker-compose up
```

Levanta Mongo (una sola instancia, base `qualiguali`) y `auth-service` en `http://localhost:4000`.
Configurá `JWT_SECRET` (y opcionalmente `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`) como variables
de entorno del shell antes de levantar, o exportalas en un `.env` en la raíz que Docker Compose
levanta automáticamente.

### Opción 2 — Node directo

```bash
# desde la raíz del monorepo
pnpm install

cd services/auth-service
cp .env.example .env   # completar JWT_SECRET, MONGODB_URI, etc.

pnpm start              # o `pnpm dev` para reinicio automático
```

Requiere una instancia de Mongo corriendo en `MONGODB_URI` (por ejemplo `mongodb://localhost:27017/qualiguali`).

## Bootstrap del primer Super Admin

`POST /auth/register` solo permite que un Super Admin cree un Admin o un QA Engineer — no existe
ningún endpoint que cree el primer Super Admin. Para eso:

```bash
cd services/auth-service
# con SUPER_ADMIN_EMAIL y SUPER_ADMIN_PASSWORD seteados (en .env o en el shell)
pnpm seed
```

El script es idempotente: si ya existe un usuario con ese email, no hace nada.

## Variables de entorno

| Variable                     | Requerida             | Default                                | Descripción                                                        |
| ---------------------------- | --------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `PORT`                       | No                    | `4000`                                 | Puerto HTTP del servicio.                                          |
| `NODE_ENV`                   | No                    | `development`                          | Entorno de ejecución.                                              |
| `MONGODB_URI`                | No                    | `mongodb://localhost:27017/qualiguali` | URI de la base compartida (misma para todos los servicios).        |
| `JWT_SECRET`                 | **Sí**                | —                                      | Secret para firmar/verificar JWT. Nunca hardcodear ni loguear.     |
| `JWT_EXPIRES_IN`             | No                    | `1h`                                   | Expiración del JWT (formato `ms`/`vercel/ms`).                     |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | No                    | `900000` (15 min)                      | Ventana del rate limit de `/auth/login`.                           |
| `LOGIN_RATE_LIMIT_MAX`       | No                    | `10`                                   | Intentos máximos de login por IP dentro de la ventana.             |
| `SUPER_ADMIN_NAME`           | Solo para `pnpm seed` | `Super Admin`                          | Nombre del Super Admin inicial.                                    |
| `SUPER_ADMIN_EMAIL`          | Solo para `pnpm seed` | —                                      | Email del Super Admin inicial.                                     |
| `SUPER_ADMIN_PASSWORD`       | Solo para `pnpm seed` | —                                      | Password del Super Admin inicial.                                  |
| `PROJECTS_SERVICE_URL`       | No                    | `http://localhost:4001`                | Base URL de `projects-service`, para validar `assignedProjectIds`. |

## Tests

```bash
cd services/auth-service
pnpm test
```

Corre unitarios (hash/verify de password, firma/verificación de JWT, lógica de permisos por rol)
e integración (endpoints reales contra `mongodb-memory-server`, incluyendo casos de error:
credenciales inválidas, rol insuficiente, usuario inactivo, email duplicado, rate limiting).

## Pendiente (fuera de alcance de esta parte)

- `POST /auth/refresh` — no implementado. El JWT es stateless de un solo uso hasta expirar, sin
  rotación ni revocación. Queda como TODO explícito en `src/controllers/auth.controller.js`.
