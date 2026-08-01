const { logger } = require('@qualiguali/shared');
const s3Client = require('../clients/s3Client');
const PostmanSuite = require('../models/PostmanSuite');
const { runSuite } = require('./postmanRunner.service');
const { persistAutomationRun } = require('./automationRunPersistence.service');

// Same derivation postmanScheduler.service.js used to compute inline for
// PostmanSchedule.lastRunStatus — factored out so both that per-schedule
// "last tick" tracking and this function's per-Suite tracking agree on what
// a runSuite() result collapses to: 'completed' on success, or whatever
// non-completed reason it failed/was rejected for otherwise.
function deriveLastRunStatus(result) {
  return result.status === 'completed' ? 'completed' : result.reason || result.status;
}

// Etapa 6 (docs/postman-runner/etapa-6-programacion-automatica.md): the
// "run it, then persist it" sequence used to live inline inside
// postmanRunner.controller.js's fire-and-forget chain (Etapa 3). Extracted
// here once a second caller needed the exact same sequence — the cron
// scheduler (postmanScheduler.service.js) — plus a third, the retry
// endpoint (automationRuns.controller.js). All three want: run the Suite,
// and only if it actually completed, upload the raw report and persist an
// AutomationRun — never duplicate that logic, never let it drift between
// the three trigger paths.
//
// `suite` only needs to look like a PostmanSuite (._id/.projectId/
// .collectionFileUrl/.environmentFileUrl/.timeoutMs/.collectionVersion/
// .environmentVersion) — it doesn't have to be a real Mongoose document.
// The retry endpoint relies on this: it passes a plain object pinned to a
// past PostmanSuiteVersion's files, not the Suite's current ones.
//
// Returns the raw runSuite() result either way, so a caller that cares
// about the outcome (the scheduler updates PostmanSchedule.lastRunStatus
// with it) doesn't have to re-derive it from what got persisted.
async function runAndPersistPostmanSuite(suite, { triggerType, triggeredBy }) {
  const result = await runSuite(suite, { triggerType, triggeredBy });

  // Denormalized onto the Suite itself (not just PostmanSchedule, which
  // only exists for scheduled ticks) so the Suites list can show "did this
  // Suite's last run even execute" without a second query against
  // AutomationRun — and, critically, without conflating that with whether
  // the run's own tests passed (see PostmanSuite.lastRunStatus's own
  // comment). Every trigger path (manual, scheduled, retry) shares this one
  // function, so this is the single place that keeps it up to date.
  await PostmanSuite.findByIdAndUpdate(suite._id, {
    lastRunAt: new Date(),
    lastRunStatus: deriveLastRunStatus(result),
  });

  if (result.status !== 'completed') {
    logger.error('Postman suite run did not complete', {
      postmanSuiteId: suite._id.toString(),
      triggerType,
      status: result.status,
      reason: result.reason,
      message: result.message,
    });
    return result;
  }

  const key = `postman-suites/${suite.projectId}/runs/${Date.now()}-newman-report.json`;
  const rawReportUrl = await s3Client.uploadObject(
    key,
    Buffer.from(JSON.stringify({ summary: result.summary, testResults: result.testResults })),
    'application/json',
  );

  await persistAutomationRun({
    projectId: suite.projectId,
    cycleId: null,
    tool: 'newman',
    triggeredBy,
    summary: result.summary,
    testResults: result.testResults,
    rawReportUrl,
    postmanSuiteId: suite._id,
    triggerType,
    collectionVersion: suite.collectionVersion,
    environmentVersion: suite.environmentVersion,
  });

  return result;
}

module.exports = { runAndPersistPostmanSuite, deriveLastRunStatus };
