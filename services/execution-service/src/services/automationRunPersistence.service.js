const AutomationRun = require('../models/AutomationRun');
const AutomationTestResult = require('../models/AutomationTestResult');
const events = require('./events');
const { storeResultValue, truncateLogs } = require('./resultStorage.service');

// Shared by both ways an AutomationRun comes into existence: a manually
// uploaded report (automationRuns.controller.js) and a live Postman Suite
// execution (postmanRunner.service.js, Etapa 3) — same AutomationRun +
// AutomationTestResult[] creation, same event, regardless of where the
// already-parsed { summary, testResults } came from. `rawReportUrl` is
// passed in already-uploaded rather than uploaded here, since what counts
// as "the raw report" differs per caller (the original file(s) for a
// manual upload, the in-memory Newman summary for a live run).
//
// postmanSuiteId/triggerType (Etapa 4): only ever set by the live-execution
// path — default to null/'manual' so the manual-upload caller doesn't need
// to change at all.
async function persistAutomationRun({
  projectId,
  cycleId,
  tool,
  triggeredBy,
  summary,
  testResults,
  rawReportUrl,
  postmanSuiteId,
  triggerType,
  collectionVersion,
  environmentVersion,
}) {
  const automationRun = await AutomationRun.create({
    projectId,
    cycleId: cycleId || null,
    tool,
    triggeredBy,
    rawReportUrl,
    postmanSuiteId: postmanSuiteId || null,
    triggerType: triggerType || 'manual',
    collectionVersion: collectionVersion || null,
    environmentVersion: environmentVersion || null,
    totalTests: summary.total,
    passed: summary.passed,
    failed: summary.failed,
    broken: summary.broken,
    skipped: summary.skipped,
    durationMs: summary.durationMs,
    executedAt: summary.executedAt,
  });

  if (testResults.length > 0) {
    // Allure/manually-uploaded-Newman testResults never carry
    // requestHeaders/requestBody/responseHeaders/responseBody/logs at
    // all — storeResultValue(undefined) resolves to `null` immediately, so
    // this is a no-op for them, not something that needs its own branch.
    const preparedResults = await Promise.all(
      testResults.map(async (testResult, index) => {
        const s3KeyPrefix = `automation-runs/${automationRun._id}/results/${index}`;
        const [requestHeaders, requestBody, responseHeaders, responseBody] = await Promise.all([
          storeResultValue(testResult.requestHeaders, {
            s3KeyPrefix: `${s3KeyPrefix}-requestHeaders`,
          }),
          storeResultValue(testResult.requestBody, { s3KeyPrefix: `${s3KeyPrefix}-requestBody` }),
          storeResultValue(testResult.responseHeaders, {
            s3KeyPrefix: `${s3KeyPrefix}-responseHeaders`,
          }),
          storeResultValue(testResult.responseBody, { s3KeyPrefix: `${s3KeyPrefix}-responseBody` }),
        ]);
        return {
          ...testResult,
          automationRunId: automationRun._id,
          requestHeaders,
          requestBody,
          responseHeaders,
          responseBody,
          logs: truncateLogs(testResult.logs),
        };
      }),
    );
    await AutomationTestResult.insertMany(preparedResults);
  }

  events.publish('AutomationRunIngested', {
    automationRunId: automationRun._id.toString(),
    projectId: automationRun.projectId,
    cycleId: automationRun.cycleId ? automationRun.cycleId.toString() : null,
    // Etapa 5 (docs/postman-runner/etapa-5-sistema-de-reportes.md): lets
    // reports-service attribute a run with no cycleId to its PostmanSuite
    // instead of dropping it after the AutomationRunIndex upsert.
    postmanSuiteId: automationRun.postmanSuiteId ? automationRun.postmanSuiteId.toString() : null,
    tool: automationRun.tool,
    summary: {
      total: automationRun.totalTests,
      passed: automationRun.passed,
      failed: automationRun.failed,
      broken: automationRun.broken,
      skipped: automationRun.skipped,
    },
    executedAt: automationRun.executedAt.toISOString(),
  });

  return automationRun;
}

module.exports = { persistAutomationRun };
