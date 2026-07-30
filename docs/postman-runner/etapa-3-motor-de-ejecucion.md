# Etapa 3 — Motor de Ejecución

> **Prerrequisito:** leer `etapa-1-arquitectura.md` antes de implementar esta etapa. Depende del modelo `PostmanSuite` de `etapa-2-gestion-de-suites.md`.

## Objetivo

Ejecutar una Suite usando Newman como motor, sin depender de la interfaz de Postman, obteniendo toda la información necesaria para reconstruir el reporte propio.

## Análisis: qué se reutiliza / qué es nuevo

- Se reutiliza al 100%: `parseNewmanReport()`/`isNewmanReport()` (`parsers/newmanParser.js`) — el JSON que produce `newman.run()` con `reporters:["json"]` tiene la misma forma (`run.executions`, `run.stats`, `run.timings`) que el archivo que hoy se sube a mano. No se reimplementa el cálculo de summary/testResults.
- Es nuevo: invocar Newman en sí (no existe la dependencia `"newman"` en el repo), capturar request/response/logs por ejecución (el reporter json trae esto en cada objeto de `run.executions`, pero hoy `newmanParser` los descarta — se extiende para conservarlos, ver Etapa 4), y el manejo de timeout/concurrencia.

## Diseño propuesto

1. Un módulo `services/postmanRunner.service.js` (nuevo) en `execution-service` expone `runSuite(suite, { triggerType, triggeredBy })`.
2. Descarga `collection.json`/`environment.json` desde sus URLs de S3 (o los tiene en memoria si se acaba de subir).
3. Envuelve `newman.run({ collection, environment, reporters: ["json"] }, callback)` en una Promise; en el callback, si hay error de ejecución (no de assertions) se registra la corrida como "failed" con el mensaje de error.
4. El objeto `summary` (`newman.run`'s callback arg) trae `run.executions`/`run.stats`/`run.timings` igual que el archivo subido a mano → se pasa directo a `parseNewmanReport()`.
5. Antes de descartar el summary, se extrae por cada `execution`: método/URL del request, headers/body (request y response) y cualquier console log — para poblar los campos nuevos de `AutomationTestResult` (Etapa 4).
6. El resultado se persiste con el mismo camino de código que ya usa `createAutomationRun` (se factoriza esa función para aceptar tanto "archivo subido" como "resultado ya parseado en memoria", evitando duplicar el bloque de creación de `AutomationRun` + `AutomationTestResult` + subida de raw report + publish del evento).

## Guardas de ejecución

- **Timeout por Suite** (campo `timeoutMs`, Etapa 2): si se supera, se llama a `emitter.abort()` de Newman y la corrida se marca como fallida con motivo "timeout".
- **Concurrencia:** un Set en memoria de `suiteId`s "corriendo" en el proceso de `execution-service`; una segunda solicitud (manual o cron) para la misma Suite mientras la anterior sigue corriendo se rechaza con `409 Conflict`.

## Ventajas / Desventajas / Alternativas

- Librería `"newman"` en proceso (elegida): acceso directo a objetos JS, sin parsear stdout ni archivos temporales; más simple de testear. Desventaja: un crash o memory leak de Newman afecta al mismo proceso que sirve el resto de la API de `execution-service`.
- Alternativa: CLI de Newman vía `child_process`, escribiendo un reporte JSON a disco y releyéndolo. Aísla crashes, pero obliga a manejar archivos temporales, parseo de stdout para errores, y no da acceso a eventos por-request en vivo (dificulta timeout granular). Se descarta para el MVP dado que ya se decidió no separar esto en otro microservicio (ver Resumen en `etapa-1-arquitectura.md`).

## Plan de tests unitarios

- `unit/postmanRunner.test.js`: mockea el módulo `"newman"` (`jest.mock`) para verificar que `runSuite` arma las opciones correctas, maneja timeout/abort, y traduce errores de ejecución a un resultado "failed" sin lanzar excepción no controlada.
- `integration/postmanRunner.test.js`: ejecuta una colección de fixture real contra un servidor Express embebido en el propio test (mismo enfoque que ya usan las pruebas de integración del repo con supertest, pero aquí sirviendo requests reales por HTTP en un puerto local efímero) para validar end-to-end que `newman.run` produce un reporte que `parseNewmanReport` acepta sin errores.
- Fixture nueva: `tests/__fixtures__/postman/sample-collection.json` + `sample-environment.json` (siguiendo la convención ya usada por `__fixtures__/newman/*.json`).
