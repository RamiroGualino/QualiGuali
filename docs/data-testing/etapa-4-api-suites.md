# Etapa 4 — API CRUD de Suites de Expectativas

**Deriva de:** `etapa-0-especificacion-funcional.md` — REQ-DT-001, 002, 007, 010.
**Depende de:** Etapa 1 (modelo `ExpectationSuite`), Etapa 2 (`spreadsheetParser`,
`columnMatching`).

## Permisos

Mismo criterio que Suites de prueba / Casos de prueba en el resto de la app: **Admin, Super Admin
y QA Engineer** pueden gestionar Suites de Expectativas (es operación día a día). Usar
`requireRole` de `@qualiguali/shared` igual que los demás servicios.

## Endpoints

Todos bajo `/api/suites` (el servicio corre en `:4006`, sin API Gateway real todavía — mismo
criterio que el resto de servicios hoy: frontend le pega directo al puerto).

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/suites` | Crea una Suite. Body: `{ projectId, name, description?, sampleLimit?, businessIdColumn?, expectedColumns, expectations }` |
| `GET` | `/api/suites?projectId=` | Lista Suites de un proyecto |
| `GET` | `/api/suites/:id` | Detalle de una Suite |
| `PUT` | `/api/suites/:id` | Edita una Suite — **incrementa `version` en 1** (BR-DT-005) |
| `DELETE` | `/api/suites/:id` | Elimina una Suite (sin cascada a Corridas — el historial de
  Corridas persiste con su propio `suiteSnapshot`, no depende de que la Suite siga existiendo) |
| `POST` | `/api/suites/detect-columns` | Multipart: sube un archivo de referencia, devuelve
  `{ headers }` (usa `spreadsheetParser`, Etapa 2) — sin persistir nada, solo para poblar el
  selector de columnas en el formulario de creación |
| `POST` | `/api/suites/:id/preview-match` | Multipart: sube un archivo, devuelve el resultado de
  `matchColumns` contra `expectedColumns` de esa Suite (Etapa 2) — usado por el modal de "nueva
  Corrida" para mostrar la sugerencia de mapeo antes de confirmar |

## Validaciones de negocio en el controller (no en el schema)

- `projectId` debe existir — llamada HTTP síncrona a `projects-service` (mismo patrón que
  `defects-service` valida `projectId`, ver `docs/DOCUMENTACION_TECNICA.md`).
- Cada expectativa del body debe tener un `expId` válido del catálogo (35 posibles) y, según su
  `scope`, `column` o `columns` presente.
- `businessIdColumn`, si viene, debe estar dentro de `expectedColumns`.

## Pruebas unitarias requeridas (Jest + Supertest + `mongodb-memory-server`)

`src/routes/__tests__/suites.test.js`, mismo patrón que los tests de endpoints existentes en el
repo (ej. `defects-service`):

- `POST /api/suites` con body válido — 201, Suite persistida.
- `POST /api/suites` sin `projectId` — 400.
- `POST /api/suites` con un `expId` inválido dentro de `expectations` — 400.
- `GET /api/suites?projectId=X` — devuelve solo las Suites de ese proyecto.
- `PUT /api/suites/:id` — `version` pasa de 1 a 2.
- `DELETE /api/suites/:id` — 204, Suite ya no aparece en el listado.
- `POST /api/suites/detect-columns` con un `.xlsx` de fixture — devuelve los headers esperados.
- `POST /api/suites/:id/preview-match` — devuelve `matchType` correcto por columna (reusa
  fixtures de Etapa 2).
- Rutas protegidas: request sin JWT — 401; JWT de un rol sin permiso (si se define alguno sin
  acceso) — 403.

## Definición de Hecho

- [ ] Los 7 endpoints implementados.
- [ ] Validación de `projectId` contra `projects-service` funcionando.
- [ ] Todos los tests de esta etapa pasan.
- [ ] Swagger/OpenAPI del servicio actualizado (mismo patrón que los otros 6 — cada servicio
  expone su propio spec).
