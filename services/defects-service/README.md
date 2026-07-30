# defects-service

Servicio de Defectos de QualiGuali. Se conecta a la base MongoDB compartida `qualiguali` y solo
lee/escribe sus propias colecciones: `defects_defects`, `defects_defectComments` y
`defects_counters` (contador para los códigos `DEF-NNN`).

## Auth

Todas las rutas requieren un JWT válido emitido por `auth-service` (`Authorization: Bearer <token>`),
verificado localmente con el mismo `JWT_SECRET`. No hay restricción de rol adicional — cualquier
usuario autenticado puede crear/editar defectos y comentarios.

## Endpoints

| Método | Ruta                    | Descripción                                                                            |
| ------ | ----------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/defects`              | Crea un defecto (código `DEF-NNN` auto-generado, estado inicial `open`).               |
| GET    | `/defects`              | Lista defectos (`?projectId=&status=&severity=&linkedExecutionId=`, todos opcionales). |
| GET    | `/defects/:id`          | Obtiene un defecto.                                                                    |
| PATCH  | `/defects/:id`          | Actualiza título/descripción/severidad/`assignedTo` (no el estado).                    |
| DELETE | `/defects/:id`          | Elimina un defecto.                                                                    |
| PATCH  | `/defects/:id/status`   | Cambia el estado, validando la transición (ver máquina de estados).                    |
| POST   | `/defects/:id/comments` | Agrega un comentario (autor = usuario autenticado).                                    |
| GET    | `/defects/:id/comments` | Lista los comentarios de un defecto.                                                   |

## Máquina de estados

```
open → in_progress → resolved → closed
                         ↓          ↓
                     reopened ← ────┘
                         ↓
                    in_progress
```

Transiciones válidas: `open→in_progress`, `in_progress→resolved`, `resolved→closed`,
`resolved→reopened`, `closed→reopened`, `reopened→in_progress`. Cualquier otra combinación
(incluido quedarse en el mismo estado) responde `400`. El cambio de estado sólo puede hacerse vía
`PATCH /defects/:id/status` — el `PATCH /defects/:id` genérico rechaza explícitamente el campo
`status`.

## Reglas de negocio implementadas

- **Código correlativo por proyecto**: cada `Defect` recibe `DEF-001`, `DEF-002`, ... vía el
  helper de contador atómico compartido (`@qualiguali/shared`'s `nextCode`/`nextSequence`,
  extraído en esta parte desde `qa-core-service` para no duplicar la lógica una tercera vez —
  ver nota de arquitectura más abajo).
- **Validación cruzada**: antes de crear un defecto se valida `projectId` contra `projects-service`
  (síncrono). Si viene `linkedExecutionId` o `linkedAutomationTestResultId`, también se valida su
  existencia contra `execution-service` (`GET /executions/:id` y
  `GET /execution/automation-test-results/:id` — este último endpoint se agregó a
  `execution-service` en esta parte específicamente para soportar este link).
- **No se infiere `title`/`description` automáticamente**: si el defecto se crea desde una
  `Execution`/`AutomationTestResult` fallida, el frontend puede precargar `title`/`description` con
  datos del origen, pero el backend no los infiere por su cuenta (tal como pide el prompt) —
  `title` y `severity` siguen siendo obligatorios en el request.
- **No se valida que lo enlazado esté en estado "fallido"**: el backend sólo confirma que
  `linkedExecutionId`/`linkedAutomationTestResultId` existen, no que su `status` sea
  `fail`/`failed` — permitir enlazar un defecto a una ejecución/test que pasó (ej. un caso flaky)
  no está prohibido por el prompt, así que no se agregó esa restricción.

## Nota de arquitectura: colección de contadores no listada

El prompt de esta parte dice que `defects-service` es dueño únicamente de `defects_defects` y
`defects_defectComments`, pero también pide generar códigos `DEF-NNN` con "el mismo mecanismo de
contador atómico usado en la Parte 2" — que requiere una colección de contadores propia (como
`qacore_counters` en `qa-core-service`). Se agregó `defects_counters` para poder implementar la
regla de negocio explícitamente pedida. **Marcado para revisión del Architect** — no se tocó el
documento de arquitectura.

## Correr en local

```bash
# desde la raíz del monorepo
pnpm install

cd services/defects-service
cp .env.example .env   # completar JWT_SECRET (mismo valor que los demás servicios)

pnpm start              # o `pnpm dev`
```

Requiere `projects-service` y `execution-service` corriendo (para las validaciones cruzadas). Con
Docker Compose desde la raíz (`docker-compose up`) se levantan Mongo, MinIO y los 5 servicios
juntos, ya cableados entre sí.

## Eventos de dominio publicados

- `DefectCreated` — al crear un defecto (`POST /defects`).
- `DefectStatusChanged` — al cambiar de estado (`PATCH /defects/:id/status`).

Mismo mecanismo que `execution-service` (Parte 3): `createEventPublisher` de `packages/shared`
construye el sobre estándar del evento. **Actualización Parte 6**: ahora publica de verdad a un
topic SNS (LocalStack en local — ver `AWS_ENDPOINT_URL`/`SNS_TOPIC_ARN` abajo), que
`reports-service` consume vía SQS para armar el dashboard. Si esas variables no están
configuradas (como en los tests), sigue cayendo en modo "solo log".

## Variables de entorno

| Variable                | Requerida | Default                                | Descripción                                                 |
| ----------------------- | --------- | -------------------------------------- | ----------------------------------------------------------- |
| `PORT`                  | No        | `4004`                                 | Puerto HTTP del servicio.                                   |
| `NODE_ENV`              | No        | `development`                          | Entorno de ejecución.                                       |
| `MONGODB_URI`           | No        | `mongodb://localhost:27017/qualiguali` | URI de la base compartida (misma para todos los servicios). |
| `JWT_SECRET`            | **Sí**    | —                                      | Debe coincidir con el de los demás servicios.               |
| `PROJECTS_SERVICE_URL`  | No        | `http://localhost:4001`                | Base URL de `projects-service` para validar `projectId`.    |
| `EXECUTION_SERVICE_URL` | No        | `http://localhost:4003`                | Base URL de `execution-service` para validar los links.     |

## Tests

```bash
cd services/defects-service
pnpm test
```

- **Unitarios**: máquina de estados (todas las transiciones válidas e inválidas), generación de
  código correlativo (incluyendo condición de carrera simulada con 25 llamadas concurrentes, vía
  el helper compartido).
- **Integración** contra `mongodb-memory-server`, con `projects-service` y `execution-service`
  mockeados: CRUD completo, intento de transición inválida (`400`), creación de defecto vinculado
  a una `Execution` y a un `AutomationTestResult`, comentarios, y el flujo completo de punta a
  punta (ejecución fallida → defecto vinculado → cambio de estado → comentario) con verificación
  de que `DefectCreated`/`DefectStatusChanged` se publican.
