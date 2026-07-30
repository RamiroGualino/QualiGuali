const MAX_STACK_TRACE_LENGTH = 2000;
const ALLURE_STATUSES = ['passed', 'failed', 'broken', 'skipped'];

// Allure has no single "run" summary file — allure-results/ is one
// *-result.json per test. A parsed object "looks like" an Allure result if
// it has the fields every result carries, regardless of status.
function isAllureResult(json) {
  return Boolean(
    json &&
    typeof json === 'object' &&
    typeof json.uuid === 'string' &&
    typeof json.name === 'string' &&
    typeof json.status === 'string',
  );
}

function extractSuiteName(labels = []) {
  const suiteLabel = labels.find((label) => label.name === 'suite');
  return suiteLabel ? suiteLabel.value : 'Unknown suite';
}

function parseAllureResult(result) {
  const { name, status, statusDetails = {}, start, stop, labels } = result;

  if (!ALLURE_STATUSES.includes(status)) {
    const err = new Error(`Unrecognized Allure test status "${status}" for test "${name}"`);
    err.status = 400;
    throw err;
  }

  return {
    suiteName: extractSuiteName(labels),
    testName: name,
    status,
    durationMs: Number.isFinite(stop) && Number.isFinite(start) ? Math.max(0, stop - start) : 0,
    errorMessage: statusDetails.message || null,
    stackTraceExcerpt: statusDetails.trace
      ? statusDetails.trace.slice(0, MAX_STACK_TRACE_LENGTH)
      : null,
    start: Number.isFinite(start) ? start : null,
  };
}

// Allure has no run-level summary either — total/passed/failed/... and the
// run's executedAt/durationMs are derived here from the per-test files:
// executedAt = earliest start, durationMs = latest stop - earliest start
// (the wall-clock span of the whole run, not the sum of per-test durations).
function parseAllureResults(allureResults) {
  if (!Array.isArray(allureResults) || allureResults.length === 0) {
    const err = new Error('No Allure result files provided');
    err.status = 400;
    throw err;
  }

  const parsed = allureResults.map(parseAllureResult);

  const starts = parsed.map((t) => t.start).filter((value) => value !== null);
  const stops = allureResults.map((r) => r.stop).filter((value) => Number.isFinite(value));

  if (starts.length === 0) {
    const err = new Error(
      'Allure results are missing "start" timestamps; cannot determine executedAt',
    );
    err.status = 400;
    throw err;
  }

  const earliestStart = Math.min(...starts);
  const latestStop = stops.length > 0 ? Math.max(...stops) : earliestStart;

  const summary = {
    total: parsed.length,
    passed: parsed.filter((t) => t.status === 'passed').length,
    failed: parsed.filter((t) => t.status === 'failed').length,
    broken: parsed.filter((t) => t.status === 'broken').length,
    skipped: parsed.filter((t) => t.status === 'skipped').length,
    durationMs: Math.max(0, latestStop - earliestStart),
    executedAt: new Date(earliestStart),
  };

  const testResults = parsed.map((t) => {
    const { start: _start, ...rest } = t;
    return rest;
  });

  return { summary, testResults };
}

module.exports = { parseAllureResults, isAllureResult };
