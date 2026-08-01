const Notification = require('../models/Notification');
const executionClient = require('../clients/executionClient');
const { logger } = require('@qualiguali/shared');

// Pure — the only thing handleAutomationRunIngested needs to decide before
// doing any I/O. Kept separate from createAutomationRunFailedNotification
// so it's directly unit-testable without mocking executionClient/Mongoose.
function shouldNotify(summary) {
  return Boolean(summary) && summary.failed > 0;
}

// Resolves a human-readable label for where this run came from — a
// PostmanSuite name if the run has one, else the ExecutionCycle name, else
// null. Same "best-effort, id as fallback" shape handleExecutionUpdated
// already uses for testCaseId → testName: a live call that degrades to the
// raw id (not a thrown error) if the owning service is unreachable or the
// record was since deleted.
async function resolveRunLabel({ postmanSuiteId, cycleId }) {
  try {
    if (postmanSuiteId) {
      const suite = await executionClient.getPostmanSuite(postmanSuiteId);
      return suite ? suite.name : postmanSuiteId;
    }
    if (cycleId) {
      const cycle = await executionClient.getExecutionCycle(cycleId);
      return cycle ? cycle.name : cycleId;
    }
  } catch (err) {
    logger.error('Could not resolve a display name for a failed-run notification', {
      postmanSuiteId,
      cycleId,
      error: err.message,
    });
  }
  return postmanSuiteId || cycleId || null;
}

// Etapa 7 (docs/postman-runner/etapa-7-sistema-de-alertas.md): called from
// handleAutomationRunIngested whenever shouldNotify(summary) is true,
// regardless of which of cycleId/postmanSuiteId/neither the run has —
// there's always at least a projectId + automationRunId to report on.
async function createAutomationRunFailedNotification({
  automationRunId,
  projectId,
  cycleId,
  postmanSuiteId,
  summary,
}) {
  const label = await resolveRunLabel({ postmanSuiteId, cycleId });
  const message = label
    ? `"${label}" had ${summary.failed} failed test(s)`
    : `An automation run had ${summary.failed} failed test(s)`;

  await Notification.create({
    projectId,
    type: 'automation_run_failed',
    title: 'Automation run failed',
    message,
    relatedAutomationRunId: automationRunId,
  });
}

module.exports = { shouldNotify, createAutomationRunFailedNotification };
