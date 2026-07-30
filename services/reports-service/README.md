# reports-service

Read-model del dashboard unificado de QA. Consume eventos de dominio (SNS → SQS, vía LocalStack en
local) publicados por `execution-service` y `defects-service`, y expone únicamente endpoints de
**lectura** — ningún endpoint público escribe sobre `reports_cycleReports` / `reports_trendPoints`,
todo cambio entra por el consumer de eventos.

## Auth

Los endpoints de lectura requieren un JWT válido (`Authorization: Bearer <token>`), igual que el
resto de los servicios. El consumer de eventos, en cambio, no tiene ningún request de usuario del
cual reenviar un token — ver "Autenticación de servicio a servicio" más abajo.

## Endpoints (solo lectura)

| Método | Ruta                                 | Descripción                                                                                            |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| GET    | `/reports/cycles/:cycleId`           | KPIs combinados (manual + Allure + Newman) + defectos abiertos de un ciclo.                            |
| GET    | `/reports/cycles/:cycleId/failures`  | Drill-down de fallos (`?origin=&module=`), con evidencia/`rawReportUrl` y defecto vinculado si existe. |
| GET    | `/reports/projects/:projectId/trend` | Serie histórica para el gráfico de tendencia (`?from=&to=&origin=`).                                   |

## Consumers de eventos (SQS)

Un consumer único (`src/consumers/sqsConsumer.js`) hace long-polling sobre una cola SQS y despacha
cada mensaje por `type` (`src/consumers/handlers.js`). **Idempotencia**: cada evento trae un
`eventId` único (`packages/shared`'s `createDomainEvent`); antes de aplicar cualquier efecto, se
inserta ese `eventId` en `reports_processedEvents` — si ya existe (`E11000`), el evento se descarta
sin reprocesar. Los mensajes de un mismo poll se procesan **secuencialmente**, no en paralelo: un
`DefectCreated` puede depender de que su `ExecutionUpdated` ya se haya aplicado, y `Promise.all`
rompía ese orden (ver tests).

- **`ExecutionUpdated`** → actualiza `totalManual/passedManual/failedManual`. Como una `Execution`
  puede re-ejecutarse (pass→fail→pass), no se incrementa a ciegas: se guarda el último estado
  conocido de cada `executionId` (`reports_executionIndex`) y se aplica un delta (resta lo que
  aportaba el estado anterior, suma lo que aporta el nuevo) — `totalManual` sólo crece la primera
  vez que se ve ese `executionId`. También mantiene `reports_failedTests` (crea/actualiza si
  `status: 'fail'`, borra si vuelve a pasar).
- **`CycleFinished`** → marca el `CycleReport` como `closed` y genera un `TrendPoint` por cada
  origen con datos (`manual`/`allure`/`newman`) más uno `combined`.
- **`AutomationRunIngested`** → suma al origen correspondiente (`allure`/`newman`) según el campo
  `tool`. El evento sólo trae el resumen agregado, no los tests individuales — para el drill-down
  de fallos, este handler hace **una llamada adicional** a `execution-service`
  (`GET /execution/automation-runs/:id` + `GET /execution/automation-runs/:id/tests`) al momento de
  consumir el evento, para traer el `rawReportUrl` del run y los tests `failed`/`broken`.
- **`DefectCreated` / `DefectStatusChanged`** → ver "Desnormalización de defectos" abajo.

## Desnormalización de defectos (y sus límites)

`code`/`severity` de un defecto **no se consultan en vivo** — ya vienen en el payload de
`DefectCreated` tal como lo publica `defects-service` (Parte 5), así que se guardan tal cual en
`CycleReport.linkedDefects[]` y en `FailedTest.linkedDefect`. `DefectStatusChanged` sólo trae
`fromStatus`/`toStatus`, y actualiza el `status` ya guardado. **El dashboard nunca depende de que
`defects-service` esté arriba para servir una lectura** — coincide con la opción que pide el
prompt.

Lo que sí fue un problema real: ni `DefectCreated` ni `DefectStatusChanged` traen un `cycleId` —
sólo `linkedExecutionId` o `linkedAutomationTestResultId`. Para saber a qué `CycleReport` sumarle
el defecto:

- **Vía `linkedExecutionId`**: se resuelve con un índice local (`reports_executionIndex`,
  poblado por `ExecutionUpdated`) — sin llamadas externas.
- **Vía `linkedAutomationTestResultId`**: no hay ningún evento que diga "este test result pertenece
  a este run" (`AutomationRunIngested` sólo trae el resumen). Se resuelve con **una llamada en
  vivo** a `execution-service` (`GET /execution/automation-test-results/:id`, que sí devuelve
  `automationRunId`) y después un índice local (`reports_automationRunIndex`, poblado por
  `AutomationRunIngested`) para pasar de `automationRunId` a `cycleId`. Esta llamada ocurre al
  **consumir el evento** (async, con reintento natural si el mensaje no se borra), nunca al servir
  el dashboard.
- Si ninguno de los dos se puede resolver (o el defecto no tiene ningún link), el defecto
  simplemente no aparece en ningún `CycleReport` — sigue existiendo en `defects-service` igual.

## Autenticación de servicio a servicio

El consumer de eventos no tiene ningún request de usuario del cual reenviar un JWT (a diferencia
del patrón usado en las Partes 2-5, donde siempre había un `Authorization` de un caller HTTP real).
`src/utils/serviceToken.js` firma un JWT interno de corta vida (`5m`) con el mismo `JWT_SECRET`
compartido — cualquier servicio ya confía en un JWT válido sin importar quién lo firmó, así que
esto funciona sin agregar infraestructura nueva. **Marcado para revisión del Architect**: es una
solución pragmática, no algo pedido explícitamente en ningún prompt anterior.

## Colecciones internas no listadas en el ERD

El documento de arquitectura sólo define `reports_cycleReports` y `reports_trendPoints` (el
read-model público). Para poder implementar lo que el prompt pide explícitamente, se agregaron:

| Colección                    | Por qué                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reports_executionIndex`     | `ExecutionUpdated` no trae `projectId`, y ningún evento resuelve `linkedExecutionId → cycleId`. Sin este índice, ninguna de las dos cosas sería posible. |
| `reports_automationRunIndex` | `AutomationRunIngested` trae `cycleId` a nivel de run, pero un defecto se linkea a un test _result_ individual, no al run.                               |
| `reports_failedTests`        | Ni `CYCLE_REPORT` ni ningún evento traen tests fallidos individuales — sin esto, `GET /reports/cycles/:id/failures` no tendría datos reales que mostrar. |
| `reports_processedEvents`    | Ledger de idempotencia (`eventId` ya procesado).                                                                                                         |

**Marcado para revisión del Architect** — igual que con `defects_counters` en la Parte 5, se
priorizó implementar la funcionalidad explícitamente pedida sobre ceñirse estrictamente al ERD
dado, dejando esto documentado en vez de silenciarlo.

## Otras dos limitaciones conocidas (documentadas, no resueltas)

- **`?module=` en el drill-down de fallos**: `Execution` (Parte 3) no guarda `moduleId`, sólo
  `testCaseId` — resolverlo requeriría otra llamada en vivo a `qa-core-service` por cada
  `testCaseId` distinto. No se implementó (para no sumar una cuarta dependencia síncrona a este
  servicio); el filtro existe en la URL pero hoy es un no-op para fallos manuales (siempre
  `moduleId: null`). Fallos de automatización tampoco tienen `moduleId` (tienen `suiteName`, un
  concepto distinto). Queda como decisión pendiente para el Architect.
- **Evidencia de ejecuciones manuales**: no existe ningún evento `EvidenceAttached` (la Parte 3 no
  lo definió), así que `GET /reports/cycles/:id/failures` resuelve la evidencia de fallos manuales
  con **una llamada en vivo** a `execution-service` (`GET /executions/:id/evidence`) al momento de
  **servir la lectura** (no al consumir eventos) — la única excepción al principio de "todo
  desnormalizado" en este servicio. Si `execution-service` no responde, esa entrada simplemente
  queda sin `evidence` (no rompe el resto de la respuesta).

## Correr en local

```bash
# desde la raíz del monorepo
pnpm install

cd services/reports-service
cp .env.example .env   # completar JWT_SECRET (mismo valor que los demás servicios)

pnpm start              # o `pnpm dev`
```

Requiere `execution-service` corriendo (para las llamadas del consumer) y, para que el consumer
haga algo, un `SQS_QUEUE_URL` apuntando a una cola real (LocalStack en local). Sin
`SQS_QUEUE_URL`, el servicio arranca igual y los endpoints de lectura funcionan, pero no hay nada
consumiendo eventos. Con Docker Compose desde la raíz (`docker-compose up`) se levanta LocalStack
(`infra/localstack-init.sh` crea el topic SNS `domain-events` y la cola SQS
`reports-service-domain-events`, suscripta con `RawMessageDelivery=true`) junto con los 6 servicios,
ya cableados entre sí.

## Variables de entorno

| Variable                | Requerida | Default                                | Descripción                                                 |
| ----------------------- | --------- | -------------------------------------- | ----------------------------------------------------------- |
| `PORT`                  | No        | `4005`                                 | Puerto HTTP del servicio.                                   |
| `NODE_ENV`              | No        | `development`                          | Entorno de ejecución.                                       |
| `MONGODB_URI`           | No        | `mongodb://localhost:27017/qualiguali` | URI de la base compartida (misma para todos los servicios). |
| `JWT_SECRET`            | **Sí**    | —                                      | Debe coincidir con el de los demás servicios.               |
| `EXECUTION_SERVICE_URL` | No        | `http://localhost:4003`                | Base URL de `execution-service` usada por el consumer.      |
| `AWS_REGION`            | No        | `us-east-1`                            | Región para el cliente SQS.                                 |
| `AWS_ENDPOINT_URL`      | No        | —                                      | Endpoint de LocalStack en local; vacío para AWS real.       |
| `SQS_QUEUE_URL`         | No        | —                                      | Cola a consumir. Sin esto, el consumer queda deshabilitado. |

## Tests

```bash
cd services/reports-service
pnpm test
```

- **Unitarios**: `computeManualDelta` (aritmética pura de conteo manual, incluyendo
  re-ejecuciones), `createSqsConsumer` con un cliente SQS fake (procesa mensajes, borra sólo los
  exitosos, no bloquea el resto si uno falla, `stop()` corta el loop).
- **Integración** contra `mongodb-memory-server`, con `execution-service` mockeado: cada handler
  (agregación correcta, idempotencia end-to-end reprocesando el mismo evento), los tres endpoints
  de lectura, y un flujo completo de punta a punta que simula la secuencia manual + Allure + Newman
  - defecto **a través de una cola SQS fake** (`createSqsConsumer` con un cliente inyectado),
    verificando que `GET /reports/cycles/:cycleId` devuelve los KPIs combinados correctos y que
    `GET /reports/cycles/:cycleId/failures` lista los fallos con su evidencia/`rawReportUrl` y el
    defecto vinculado.
