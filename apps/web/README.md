# apps/web

Frontend de QualiGuali: shell (sidebar + layout), login, i18n es/en, tema claro/oscuro, y las
pantallas de los módulos ya implementados en el backend (Partes 1-6): Proyectos, Módulos,
Requerimientos, Casos de prueba (con plantilla personalizable), Planes de prueba, Ciclos de
ejecución (con carga de evidencia drag-and-drop), Automatización (carga drag-and-drop de Allure/
Newman) y Defectos, más el dashboard de reportes.

## Stack y decisiones de implementación

- **React 18** + JavaScript (sin TS), **Vite** como build tool (dev server rápido, sin necesidad de
  configurar Tailwind ni un compilador CSS-in-JS).
- **CSS Modules** para estilos (la otra opción permitida era styled-components; se eligió CSS
  Modules para no sumar una dependencia de runtime y mantener los estilos co-ubicados con cada
  componente).
- **React Router v6** para el ruteo, **TanStack Query** para todo fetch remoto (sin
  `useEffect` + `fetch` manual en ningún lado), **react-i18next** para i18n, **recharts** para el
  gráfico de tendencia del dashboard.
- No hay API Gateway todavía (Parte 1), así que el browser le pega directo a cada uno de los 6
  servicios (`src/api/config.js` define las 6 base URLs vía variables `VITE_*`).

## Identidad visual

Paleta y layout tal como los define el prompt (`src/theme/tokens.css`): verde `#3FA66C` primario,
fondo crema `#F4F3EE`, tinta `#2B2620`, gris cálido `#8A8578`, verde pass `#2D7D4F`, terracota fail
`#C1543C`. El modo oscuro **no** viene especificado en hex por el prompt (sólo pide "mantener
contraste AA") — se derivó invirtiendo los tonos claros y aclarando los acentos lo necesario para
seguir siendo legibles sobre fondo oscuro. Botones grandes (`size="lg"`) se usan en las acciones
críticas: login, registrar resultado de ejecución, cambiar estado de un defecto.

## Documentos de referencia no disponibles

El prompt de esta parte pide `QualiGuali_SDLC_v1.md` §3 y `QualiGuali_Arquitectura_v1.1.md` §10
como "documento de referencia obligatorio", pero **ninguno de los dos existe en este repo** (sólo
está `QualiGuali_Arquitectura_v1.2.md`). Se construyó igual con la identidad visual y el diseño del
dashboard (KPI cards, tendencia, breakdown, drill-down, filtros) tal como quedaron **restated
explícitamente dentro del propio prompt de la Parte 7**, que alcanza para cubrir todo lo pedido sin
inventar nada por fuera de ese texto.

## CORS: cambio necesario en los 6 backends

Ningún servicio backend tenía CORS habilitado (no hacía falta hasta que un browser necesitó
pegarles directo). Se agregó `createCors()` a `packages/shared` y se lo montó en el `app.js` de los
6 servicios — es plomería necesaria para que el frontend funcione, no una regla de negocio nueva.
Por defecto refleja el origin del request (dev-friendly, dado que el puerto de Vite puede variar);
`CORS_ORIGIN` (env var, coma-separado) permite restringirlo por ambiente.

## Sesión (JWT) y localStorage

`auth-service` sólo devuelve un JWT (sin cookie de sesión), así que en una SPA pura la única forma
de sobrevivir un refresh de página sin forzar un nuevo login es guardar una copia en
`localStorage` — exactamente la excepción que el prompt permite ("fuera de artifacts esto sí está
permitido en la app real ... pero mantenerlo mínimo"). Sólo se guarda `{ token, user }`
(`src/auth/AuthContext.jsx`), nada más, y se borra en logout o ante cualquier 401. El tema y el
idioma también usan `localStorage`, pero esos no son session-critical.

## Estructura

```
src/
├── api/            # un cliente por servicio (auth/projects/qaCore/execution/defects/reports)
├── auth/           # AuthContext, ProtectedRoute
├── components/     # UI compartida (Button, Card, Table, Modal, Dropzone, TestCaseForm, ...)
├── layout/         # AppShell, Sidebar, Topbar
├── pages/          # una por pantalla
├── theme/          # paleta + ThemeContext (claro/oscuro)
├── i18n/           # config + locales es/en
├── router.jsx
├── App.jsx
└── main.jsx
tests/              # componentes (Vitest + React Testing Library)
e2e/                # Playwright
```

## Correr en local

```bash
# desde la raíz del monorepo, con los 6 servicios corriendo (docker-compose up)
pnpm install

cd apps/web
cp .env.example .env   # ajustar las VITE_*_URL si no usás los puertos default

pnpm dev                # http://localhost:5173
```

Necesitás un Super Admin ya sembrado en `auth-service` para poder loguearte
(`pnpm --filter auth-service seed`, ver su README).

## Variables de entorno

Ver `.env.example` — una `VITE_*_URL` por servicio backend, todas con default apuntando a los
puertos que usa `docker-compose.yml` (4000-4005).

## Tests

```bash
cd apps/web
pnpm test        # Vitest + React Testing Library
pnpm e2e         # Playwright — requiere el stack completo corriendo, ver abajo
```

- **Componente**: login (envío de credenciales, mensaje de error), `TestCaseForm` (renderiza los
  campos dinámicos de la plantilla seleccionada, cambia los campos al cambiar de plantilla, envía
  `customFields` correctamente), `Dropzone` (arrastrar-y-soltar y selección de archivo vía input
  oculto), dashboard de reportes (KPIs combinados con datos mockeados, mensaje de "sin reporte
  todavía", fallo con defecto vinculado).
- **E2E** (`e2e/fullFlow.spec.js`, Playwright): login → crear proyecto → crear caso de prueba →
  crear plan → crear ciclo desde el plan → marcar pass → ver el KPI combinado en el dashboard.
  Corre contra el stack real (`docker-compose up` + `pnpm --filter web dev`), no contra mocks —
  **no se pudo ejecutar en este sandbox** (no hay Docker disponible acá, mismo límite que en las
  Partes 1-6), pero `npx playwright test --list` confirma que el archivo es válido.

### Nota sobre Node 25 + Vitest/jsdom

Los scripts `test`/`test:watch` corren con `NODE_OPTIONS=--no-experimental-webstorage`. Node 25
estabilizó un `localStorage` global propio que pisa el que jsdom le arma a `window` en el entorno
de test, rompiendo cualquier código que use `window.localStorage` (theme, idioma, sesión). Sin ese
flag, todos los tests que tocan alguno de esos tres fallan con
`window.localStorage.getItem is not a function`.

## Limitación heredada del backend: filtro `?module=`

El dashboard (`GET /reports/cycles/:id/failures?module=`) expone el filtro por módulo en la UI,
pero `reports-service` (Parte 6) documentó que ese filtro es un no-op para fallos manuales
(`Execution` no guarda `moduleId`) — ver su README. No se ocultó el filtro de la UI porque el
prompt no pide inventar ese tipo de restricción condicional; queda visible pero sin efecto hasta
que se resuelva en el backend.
