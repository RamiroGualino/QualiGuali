const MAX_STACK_TRACE_LENGTH = 2000;

function isNewmanReport(json) {
  return Boolean(json && json.run && Array.isArray(json.run.executions) && json.run.stats);
}

function extractSuiteName(newmanJson) {
  return (
    (newmanJson.collection && newmanJson.collection.info && newmanJson.collection.info.name) ||
    'Newman collection'
  );
}

// Per execution (= one request run from the collection): it's "failed" if
// any of its assertions carries an `error`, "passed" otherwise. Newman has
// no broken/skipped concept at this granularity (those stay 0 on the run).
function parseExecution(execution, suiteName) {
  const assertions = execution.assertions || [];
  const failedAssertion = assertions.find((assertion) => assertion.error);
  const status = failedAssertion ? 'failed' : 'passed';

  const durationMs =
    execution.response && Number.isFinite(execution.response.responseTime)
      ? execution.response.responseTime
      : 0;

  return {
    suiteName,
    testName: (execution.item && execution.item.name) || 'Unnamed request',
    status,
    durationMs,
    errorMessage: failedAssertion
      ? (failedAssertion.error && failedAssertion.error.message) || failedAssertion.assertion
      : null,
    stackTraceExcerpt:
      failedAssertion && failedAssertion.error && failedAssertion.error.stack
        ? failedAssertion.error.stack.slice(0, MAX_STACK_TRACE_LENGTH)
        : null,
  };
}

// NOTE for architect review: the prompt suggests reading run.stats for the
// summary, but run.stats.assertions counts *assertions*, not *requests* —
// that would make AutomationRun.totalTests disagree with the actual number
// of AutomationTestResult docs we persist (one per execution/request). The
// summary below is derived from run.executions[] instead, so totalTests
// always equals testResults.length.
function parseNewmanReport(newmanJson) {
  if (!isNewmanReport(newmanJson)) {
    const err = new Error(
      'Payload does not look like a Newman JSON report (missing run.executions/run.stats)',
    );
    err.status = 400;
    throw err;
  }

  const { executions } = newmanJson.run;
  if (executions.length === 0) {
    const err = new Error('Newman report has no executions');
    err.status = 400;
    throw err;
  }

  const suiteName = extractSuiteName(newmanJson);
  const testResults = executions.map((execution) => parseExecution(execution, suiteName));

  const timings = newmanJson.run.timings || {};
  if (!Number.isFinite(timings.started)) {
    const err = new Error(
      'Newman report is missing run.timings.started; cannot determine executedAt',
    );
    err.status = 400;
    throw err;
  }

  const durationMs = Number.isFinite(timings.completed)
    ? timings.completed - timings.started
    : testResults.reduce((sum, t) => sum + t.durationMs, 0);

  const summary = {
    total: testResults.length,
    passed: testResults.filter((t) => t.status === 'passed').length,
    failed: testResults.filter((t) => t.status === 'failed').length,
    broken: 0,
    skipped: 0,
    durationMs: Math.max(0, durationMs),
    executedAt: new Date(timings.started),
  };

  return { summary, testResults };
}

module.exports = { parseNewmanReport, isNewmanReport };
