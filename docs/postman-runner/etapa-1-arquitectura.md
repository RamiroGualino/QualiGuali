# Etapa 1 — Arquitectura

> **Contexto fijo del módulo.** Este archivo incluye el resumen, el análisis de encaje con el código actual de QualiGuali, el diseño de arquitectura completo (Etapa 1 del plan original) y el plan de trabajo general. **Leer este archivo antes de implementar cualquiera de las etapas 2 a 8** — contiene las decisiones y el vocabulario que las demás etapas dan por sentado.
>
> No se genera código en esta etapa (por pedido explícito del plan original). Este documento es la base a aprobar antes de implementar.

---

## 0. Resumen y decisiones de arquitectura

Este documento analiza el "Plan de Implementación – Módulo Ejecutor de Colecciones Postman" contra el código real de QualiGuali (monorepo pnpm, 6 microservicios Node/Express + Mongo compartido, eventos de dominio vía SNS/SQS, frontend React) y propone, para cada una de las 8 etapas del plan original, un diseño concreto que reutiliza lo que ya existe y evita duplicar lógica. Sigue la "Forma de Trabajo" del plan original: cada etapa se analiza y diseña aquí, pero no se implementa hasta su aprobación explícita.

### Decisiones de arquitectura ya tomadas

| Decisión | Resolución |
|---|---|
| Dónde vive el módulo | Se extiende `execution-service` (no se crea un microservicio nuevo). `execution-service` ya tiene la ingesta de reportes Newman/Allure (`parsers/newmanParser.js`, modelos `AutomationRun`/`AutomationTestResult`, subida a S3/MinIO, evento `AutomationRunIngested`); el nuevo Runner reutiliza ese pipeline en vez de duplicarlo en un servicio aparte. |
| Scheduling / background jobs | `node-cron` in-process para el MVP, sin agregar Redis/BullMQ. Es el único cambio de infraestructura nuevo del módulo. Queda documentado el camino de migración a una cola real (BullMQ + Redis) para cuando el proyecto pase a ECS/EKS (ya marcado como "[DECISIÓN PENDIENTE]" en `docs/RUNBOOK.md`). |
| Formato de entrega | Un documento por etapa (este set de 8 archivos), en vez de un único documento monolítico. |

---

## 1. Análisis de encaje con la arquitectura actual

Antes de diseñar cada etapa se revisó el código real de los 6 servicios, el paquete compartido y el frontend. La conclusión central: el "Ejecutor de Colecciones Postman" no es una funcionalidad aislada — es una nueva fuente de datos (Newman ejecutado en vivo, en vez de subido a mano) que debe alimentar el mismo pipeline de ingesta, almacenamiento, eventos y reportes que ya existe para automatización. El principio rector de todo este documento es: **reutilizar ese pipeline, no bifurcarlo**.

### 1.1 Piezas existentes que se reutilizan tal cual o casi tal cual

| Pieza existente | Cómo se reutiliza |
|---|---|
| `services/execution-service/src/parsers/newmanParser.js` | Ya parsea exactamente el JSON que produce el reporter `"json"` de Newman (`run.executions`, `run.stats`, `run.timings`) a `{ summary, testResults }`. El Runner (Etapa 3) genera ese mismo JSON al ejecutar la colección y lo pasa sin cambios a `parseNewmanReport` — cero lógica de parseo nueva. |
| Modelos `AutomationRun` / `AutomationTestResult` | Siguen siendo la fuente de verdad de todo resultado de automatización (Allure o Newman, subido o ejecutado). Se extienden con unos pocos campos opcionales (Etapa 4) en vez de crear un modelo paralelo "PostmanExecution". |
| `services/execution-service/src/clients/s3Client.js` | Mismo bucket/política de lectura pública que ya usan evidencias y raw reports. Se reutiliza para: archivos de colección/environment subidos (Etapa 2), raw report de cada corrida (ya sucede hoy) y bodies grandes de request/response (Etapa 4). |
| `packages/shared/src/events/publisher.js` + evento `AutomationRunIngested` | El Runner publica el mismo evento que ya publica la ingesta manual. `reports-service` no distingue "subido a mano" de "ejecutado por el Runner" — ya está consumiendo este evento. |
| `reports-service`: `AutomationRunIndex`, `FailedTest`, `TrendPoint` + su consumer | Es el read-model de reportes/dashboard/tendencia. Se extiende su handler (Etapa 5) para cubrir corridas sin `cycleId` (las Suites de Postman no siempre estarán atadas a un Ciclo de Ejecución manual), en vez de crear un read-model nuevo. |
| Frontend: `AutomationPage.jsx`, `Dropzone`, `Table`, `StatusBadge`, componentes de `reportPdf.js`/`spreadsheet.js` | El patrón de subir archivos + tabla de corridas + drawer de detalle + export ya existe para Allure/Newman manual. Las pantallas nuevas (gestión de Suites, detalle de corrida, alertas) siguen el mismo patrón visual y los mismos componentes, no una librería de UI nueva. |
| `@qualiguali/shared` (auth, cors, errorHandler, logger) | El Runner y sus rutas nuevas usan `createAuthenticate`/`requireRole` igual que el resto de `execution-service` — ningún mecanismo de auth nuevo. |

### 1.2 Qué es genuinamente nuevo

- Ejecutar Newman (motor de ejecución) — hoy solo se ingieren reportes ya generados; no existe ninguna dependencia `"newman"` en el repo.
- Modelo de Suite de Postman (colección + environment + versionado + asociación a Proyecto/Requerimiento) — no existe un concepto de "colección subida" hoy, solo `TestSuite` (casos manuales) que no aplica.
- Captura de request/response/logs por test ejecutado — `AutomationTestResult` hoy solo guarda nombre/estado/duración/error, no el payload completo.
- Programación (cron) y ejecución en segundo plano — no existe scheduler ni cola de jobs en ningún servicio hoy.
- Sistema de notificaciones/alertas — no existe ningún modelo de notificación ni mecanismo de alerta hoy.
- Exportación a HTML del reporte — hoy solo hay export a PDF (jspdf) y a Excel/CSV.
- Comparación entre ejecuciones / detección de regresiones — no existe ninguna vista de diff entre corridas.

Las 8 etapas siguientes se diseñan con esa lista como restricción: cada vez que el plan original pide algo que ya existe, la sección lo señala explícitamente y se extiende en vez de reconstruirse.

---

## Etapa 1 — Arquitectura (diseño completo)

### Componentes del módulo

| Componente | Vive en | Responsabilidad |
|---|---|---|
| `PostmanSuite` (modelo + CRUD) | `execution-service` | Colección + environment + versión + asociación a Proyecto/Requerimiento (Etapa 2) |
| Runner (motor de ejecución) | `execution-service` | Invoca Newman en proceso, produce el JSON de reporte, lo pasa al parser existente (Etapa 3) |
| `AutomationRun` / `AutomationTestResult` (extendidos) | `execution-service` | Persisten cada corrida y cada test, igual que hoy con Allure/Newman subido a mano (Etapa 4) |
| `PostmanSchedule` + scheduler `node-cron` | `execution-service` | Programación de corridas automáticas (Etapa 6) |
| `Notification` (nuevo modelo) | `reports-service` | Alertas cuando una corrida termina con fallos (Etapa 7) |
| `AutomationRunIndex` / `FailedTest` / `TrendPoint` (extendidos) | `reports-service` | Historial, tendencia y comparación (Etapa 5 y 8) |
| Pantallas de Suites, ejecución, reportes y alertas | `apps/web` | UI, reutilizando componentes existentes |

### Flujo completo (de la carga de una colección al reporte)

1. El usuario crea una Suite en el Proyecto (opcionalmente asociada a un Requerimiento) y sube `collection.json` + `environment.json` (Etapa 2). Los archivos se validan y se suben a S3 vía el mismo `s3Client` que ya usan evidencias y raw reports.
2. El usuario dispara una ejecución manual, o el scheduler (`node-cron`) la dispara según el cron configurado en un `PostmanSchedule` (Etapa 6).
3. El endpoint responde `202 Accepted` de inmediato (no bloquea el request HTTP) y marca la Suite como "corriendo" en memoria para evitar solapamientos.
4. El Runner invoca `newman.run()` con la colección/environment descargados de S3, en proceso (Etapa 3). Newman produce el mismo JSON que hoy se sube a mano.
5. Ese JSON se pasa, sin cambios, a `parseNewmanReport()` (ya existente) y se persiste con el mismo camino que la ingesta manual: `AutomationRun` + `AutomationTestResult` (extendidos, Etapa 4), raw report subido a S3.
6. Se publica `AutomationRunIngested` (mismo evento de siempre, con `postmanSuiteId` y `triggerType` agregados al payload).
7. `reports-service` consume el evento: actualiza `AutomationRunIndex`/`FailedTest`/`TrendPoint` (Etapa 5 y 8) y, si hubo fallos, crea una `Notification` (Etapa 7).
8. El frontend consulta historial, reportes, comparación entre corridas y notificaciones (Etapa 5, 7 y 8) con los mismos componentes de tabla/drawer/PDF que ya existen para Allure/Newman manual.

### Modelo de datos (nuevo + extendido) — panorama

| Entidad | Naturaleza |
|---|---|
| `PostmanSuite` | Nueva. Colección + environment + versión, en `execution-service`. |
| `PostmanSuiteVersion` | Nueva. Historial de versiones de colección/environment de una Suite. |
| `PostmanSchedule` | Nueva. Cron + estado de programación de una Suite. |
| `AutomationRun` | Existente, extendida con `postmanSuiteId` y `triggerType`. |
| `AutomationTestResult` | Existente, extendida con request/response/logs opcionales. |
| `Notification` | Nueva, en `reports-service` (que ya es el consumidor de eventos). |
| `AutomationRunIndex` / `FailedTest` / `TrendPoint` | Existentes, su handler se extiende para no depender de `cycleId`. |

El detalle de cada modelo está en el archivo de la etapa correspondiente, para no repetir el mismo diseño dos veces.

### Integración con Newman

- Se usa la librería programática `"newman"` (paquete npm), no el binario CLI vía `child_process`: da acceso directo a los objetos JS del resultado (sin parsear stdout) y permite escuchar eventos por request (para capturar request/response, Etapa 4).
- Se invoca con `reporters: ["json"]` y se lee el objeto de callback (o el summary emitido) en vez de escribir a disco y releerlo — el resultado nunca toca el filesystem del contenedor.
- El shape que produce `newman.run` coincide con el que ya valida `isNewmanReport()`/`parseNewmanReport()` — se verifica en Etapa 3 con un test de integración real (correr Newman contra una colección de fixture).

### Estrategia de procesos en segundo plano

- `newman.run()` es asíncrono (basado en callback/EventEmitter) — no bloquea el event loop de Express mientras corre.
- Un registro en memoria (Set de `suiteId`s "corriendo") evita que la misma Suite se ejecute dos veces en simultáneo (disparo manual + cron, o dos disparos manuales seguidos).
- Se define un timeout configurable por Suite; si se excede, se aborta la ejecución (`emitter.abort()` de Newman) y la corrida queda registrada como "failed"/"timeout" en vez de colgar el proceso indefinidamente.
- No se usa un microservicio ni un proceso worker separado para esto — ver la decisión de arquitectura del Resumen: se acepta correr en el mismo proceso de `execution-service` para el MVP.

### Sistema de programación de tareas (Cron)

- `node-cron`, in-process, sin infraestructura nueva. Al iniciar `execution-service` se cargan todos los `PostmanSchedule` activos y se registran como tareas cron.
- Cuando se crea, edita, activa o desactiva un Schedule, el proceso re-registra esa tarea puntual (sin reiniciar el servicio completo).
- Limitación aceptada para el MVP: si el proceso se reinicia justo entre el cálculo y el disparo de una corrida programada, esa corrida puntual se pierde (no hay persistencia de "jobs pendientes"). Se documenta como riesgo conocido, no se resuelve en este módulo — ver alternativas en Etapa 6.

### Diseño del almacenamiento de resultados

Detallado en Etapa 4. Resumen: se reutiliza `AutomationRun`/`AutomationTestResult`; los payloads grandes (request/response) van a S3 con un umbral de tamaño, igual que ya se hace con evidencias y raw reports, para no inflar los documentos de Mongo.

### Diseño del sistema de reportes

Detallado en Etapa 5. Resumen: reutiliza el read-model de `reports-service` y los mismos componentes de PDF/tabla del frontend; se agrega export a HTML como nuevo formato.

### Diseño del sistema de notificaciones

Detallado en Etapa 7. Resumen: `reports-service` (ya consumidor del evento) crea un registro de `Notification` cuando una corrida termina con fallos; el frontend hace polling con react-query (mismo patrón ya usado en toda la app).

### Estrategia de escalabilidad y mantenibilidad

- Todo el módulo nuevo depende exclusivamente de infraestructura que ya existe (Mongo, S3/MinIO, SNS/SQS) salvo `node-cron`, que no requiere infraestructura adicional.
- El único límite real de escalabilidad del MVP es correr Newman in-process dentro de `execution-service`: si el volumen de Suites/ejecuciones concurrentes crece, el camino de escalado es mover el Runner a un microservicio dedicado (o a jobs de BullMQ+Redis) sin cambiar el modelo de datos ni el evento `AutomationRunIngested` — el resto del sistema no necesita enterarse de dónde corrió Newman.
- Ese mismo razonamiento aplica al scheduler: `node-cron` in-process hoy, BullMQ+Redis (con repeatable jobs) el día que el despliegue pase de una instancia EC2 a múltiples instancias/ECS — ya está marcado como decisión pendiente general en `docs/RUNBOOK.md`.

---

## Plan de trabajo y próximos pasos

Siguiendo la "Forma de Trabajo" del plan original: cada etapa se analiza, se diseña y se aprueba explícitamente antes de implementarse — no se avanza a la siguiente etapa sin aprobación. Estos 8 archivos cubren el análisis y diseño de las 8 etapas; la implementación de cada una queda pendiente de aprobación puntual.

### Orden sugerido de implementación

1. Etapa 2 (Suites) → Etapa 3 (Runner) → Etapa 4 (Modelo de resultados): camino crítico mínimo para tener una ejecución de punta a punta funcionando (crear Suite, ejecutarla manualmente, ver el resultado persistido).
2. Etapa 5 (Reportes): sin esto, los resultados existen pero no son consumibles/exportables cómodamente.
3. Etapa 6 (Cron) y Etapa 7 (Alertas): agregan automatización sobre el camino crítico ya funcionando.
4. Etapa 8 (Historial/comparación): el mayor valor aparece recién cuando ya hay varias corridas acumuladas, por eso tiene sentido dejarla al final.

### Decisiones menores pendientes antes de arrancar Etapa 2

- Tamaño máximo aceptado para `collection.json`/`environment.json` subidos.
- Umbral exacto (KB) para decidir Mongo vs. S3 en request/response de Etapa 4.
- Si además de "failed > 0" alguna otra condición debería disparar alerta en Etapa 7 (p. ej. errores de ejecución del propio Newman, no solo assertions fallidas).
