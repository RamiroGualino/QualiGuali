const newman = require('newman');
const { parseNewmanReport } = require('../parsers/newmanParser');

// Etapa 3 (docs/postman-runner/etapa-3-motor-de-ejecucion.md): runs a
// PostmanSuite through Newman, in-process, and returns a result in the same
// { summary, testResults } shape parseNewmanReport already produces for a
// manually-uploaded report — nothing downstream needs to know the
// difference between "someone uploaded a file" and "we just ran it live".
// Etapa 4 (docs/postman-runner/etapa-4-modelo-de-resultados.md) adds the
// per-execution request/response/console-log capture this file header used
// to defer — see extractRequestDetails() below.
//
// Deliberately doesn't persist anything itself (no AutomationRun, no S3
// upload) — that's the caller's job (see postmanRunner.controller.js), via
// the same persistAutomationRun() a manually-uploaded report goes through.
// Keeping this module a pure "run and report back" engine is what makes it
// directly unit-testable (mock "newman") without a database.

// In-memory guard against the same Suite running twice at once (a manual
// trigger while a scheduled one — Etapa 6 — is still going, or two manual
// triggers back to back). Lives only in this process's memory: the MVP
// runs Newman in-process on a single execution-service instance (see
// etapa-1's "Estrategia de escalabilidad"), so this is enough for now —
// it would need to move to a shared store (e.g. a Mongo lock document) the
// day this service runs as more than one instance.
const runningSuiteIds = new Set();

function isSuiteRunning(suiteId) {
  return runningSuiteIds.has(String(suiteId));
}

async function fetchJson(url, label) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Failed to download ${label} from "${url}": ${err.message}`, { cause: err });
  }
  if (!response.ok) {
    throw new Error(
      `Failed to download ${label} from "${url}": ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

// Console output never makes it into newman.run()'s own summary object —
// verified against a real run (see the Etapa 4 investigation notes in
// docs/postman-runner/), not assumed: the only way to capture a
// pm-test-script's console.log/warn/error calls is a live 'console' event
// on the run's emitter, each one tagged with the same cursor.ref its
// owning execution's own execution.cursor.ref carries. That's also why
// this is Etapa 3's Runner-only capability, never something a
// manually-uploaded report (Allure or a pre-exported Newman JSON) could
// have: by the time a report file exists, that console output is gone.
function collectConsoleLogs(emitter) {
  const logsByCursorRef = new Map();
  emitter.on('console', (_err, event) => {
    const ref = event && event.cursor && event.cursor.ref;
    if (!ref) return;
    const rendered = (Array.isArray(event.messages) ? event.messages : [event.messages])
      .map((message) => (typeof message === 'string' ? message : JSON.stringify(message)))
      .join(' ');
    const line = event.level ? `[${event.level}] ${rendered}` : rendered;
    const existing = logsByCursorRef.get(ref);
    if (existing) {
      existing.push(line);
    } else {
      logsByCursorRef.set(ref, [line]);
    }
  });
  return logsByCursorRef;
}

// Wraps newman.run in a Promise that settles exactly once — whichever comes
// first between Newman's own callback and the timeout. On timeout,
// emitter.abort() is called as a best-effort signal to stop Newman, but the
// promise doesn't wait to see whether Newman's callback still fires
// afterward; it's already settled by then.
function runNewman(runOptions, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let emitter;
    // Declared (and given a real, empty Map, not left undefined) before
    // newman.run() is even called — real Newman always calls back
    // asynchronously, so by the time the callback below actually fires this
    // has long since been reassigned to collectConsoleLogs(emitter)'s real
    // Map. The empty-Map default only matters for a callback that fires
    // synchronously (a test double calling back inline, not real Newman);
    // it keeps resolve()'s logsByCursorRef a valid Map either way, instead
    // of undefined.
    let logsByCursorRef = new Map();

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (emitter) emitter.abort();
      const err = new Error(`Postman suite execution timed out after ${timeoutMs}ms`);
      err.isTimeout = true;
      reject(err);
    }, timeoutMs);

    emitter = newman.run(runOptions, (err, summary) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
        return;
      }
      resolve({ summary, logsByCursorRef });
    });
    logsByCursorRef = collectConsoleLogs(emitter);
  });
}

// Etapa 4: pulls per-execution request/response detail straight from
// Newman's own SDK objects (Header/Url/RequestBody instances, not plain
// JSON — hence .toJSON()/.toString()/.text() rather than direct property
// access) and pairs each one with whatever console output that same
// execution logged. Positional, not keyed — testResults[i] here always
// corresponds to newmanExecutions[i], since both are derived from the same
// run.executions array in the same order.
function extractRequestDetails(newmanExecutions, logsByCursorRef) {
  return newmanExecutions.map((execution) => {
    const { request, response } = execution;
    return {
      method: (request && request.method) || null,
      url: request && request.url ? String(request.url) : null,
      requestHeaders:
        request && request.headers && typeof request.headers.toJSON === 'function'
          ? request.headers.toJSON()
          : null,
      requestBody: request && request.body ? String(request.body) : null,
      responseStatus: response && Number.isFinite(response.code) ? response.code : null,
      responseHeaders:
        response && response.headers && typeof response.headers.toJSON === 'function'
          ? response.headers.toJSON()
          : null,
      responseBody: response && typeof response.text === 'function' ? response.text() : null,
      logs: logsByCursorRef.get(execution.cursor && execution.cursor.ref) || [],
    };
  });
}

// Never throws/rejects for an expected execution-level outcome (already
// running, a broken collection, an unreachable target, a timeout) — all of
// those come back as a differently-tagged { status } result instead,
// exactly what the Etapa 3 test plan asks for ("traduce errores de
// ejecución a un resultado 'failed' sin lanzar excepción no controlada").
// One uniform contract for every caller (this module's own HTTP trigger
// today, a future scheduler in Etapa 6) beats mixing "sometimes throws,
// sometimes resolves" depending on which failure it was.
//
// "Already running" resolves as status: 'rejected' rather than throwing for
// a more specific reason too: this is an `async function`, so a `throw`
// here — even before any `await` — becomes a *rejected promise*, not a
// synchronous exception a caller could try/catch around the call itself.
// The HTTP trigger wants to answer "already running?" with a real 409
// before it commits to a 202 response, so it does its own best-effort
// synchronous pre-check via isSuiteRunning() (see postmanRunner.controller.js)
// — this in-function check is what actually enforces it, that one is just
// what lets the HTTP layer respond with the right status code most of the
// time.
//
// triggerType/triggeredBy are accepted now (forward-compatible with Etapa 6's
// scheduler calling this the same way) but aren't used inside this
// function — there's no field on AutomationRun yet to carry "who/what
// triggered this" beyond the existing triggeredBy the caller already passes
// to persistAutomationRun separately (Etapa 4 adds that link).
async function runSuite(suite, { triggerType: _triggerType, triggeredBy: _triggeredBy } = {}) {
  const suiteId = String(suite._id);
  if (isSuiteRunning(suiteId)) {
    return {
      status: 'rejected',
      reason: 'already_running',
      message: `Postman suite "${suiteId}" is already running`,
      startedAt: new Date(),
      durationMs: 0,
    };
  }

  runningSuiteIds.add(suiteId);
  const startedAt = new Date();
  const elapsed = () => Date.now() - startedAt.getTime();

  try {
    let collection;
    let environment;
    try {
      collection = await fetchJson(suite.collectionFileUrl, 'collection');
      environment = suite.environmentFileUrl
        ? await fetchJson(suite.environmentFileUrl, 'environment')
        : undefined;
    } catch (err) {
      return {
        status: 'failed',
        reason: 'download_error',
        message: err.message,
        startedAt,
        durationMs: elapsed(),
      };
    }

    let newmanSummary;
    let logsByCursorRef;
    try {
      ({ summary: newmanSummary, logsByCursorRef } = await runNewman(
        {
          collection,
          environment,
          // No `reporters` — the run summary this module actually reads
          // (run.executions/run.stats/run.timings) is built by Newman's
          // core runner regardless of which reporters are attached; it's
          // not something only the "json" reporter produces. The "json"
          // reporter's *entire job* is dumping that same summary to a file
          // on disk (lib/reporters/json/index.js — it pushes a file export
          // unconditionally, `options.export: false` doesn't suppress it,
          // only renames it), which we don't want: we already have
          // everything we need in-memory via the callback argument.
        },
        suite.timeoutMs,
      ));
    } catch (err) {
      return {
        status: 'failed',
        reason: err.isTimeout ? 'timeout' : 'execution_error',
        message: err.message,
        startedAt,
        durationMs: elapsed(),
      };
    }

    try {
      const { summary, testResults } = parseNewmanReport(newmanSummary);
      const requestDetails = extractRequestDetails(newmanSummary.run.executions, logsByCursorRef);
      const enrichedTestResults = testResults.map((testResult, index) => ({
        ...testResult,
        ...requestDetails[index],
      }));
      return { status: 'completed', summary, testResults: enrichedTestResults, startedAt };
    } catch (err) {
      // parseNewmanReport/extractRequestDetails failing on an otherwise-
      // completed Newman run is unexpected (a shape Newman itself never
      // actually produces), but the "never throws" contract still applies —
      // surface it the same way a broken collection or an execution error
      // would come back, rather than letting it propagate to the caller.
      return {
        status: 'failed',
        reason: 'execution_error',
        message: err.message,
        startedAt,
        durationMs: elapsed(),
      };
    }
  } finally {
    runningSuiteIds.delete(suiteId);
  }
}

module.exports = { runSuite, isSuiteRunning };
