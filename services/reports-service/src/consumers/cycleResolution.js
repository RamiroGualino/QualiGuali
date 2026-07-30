const CycleReport = require('../models/CycleReport');
const ExecutionIndex = require('../models/ExecutionIndex');
const AutomationRunIndex = require('../models/AutomationRunIndex');
const executionClient = require('../clients/executionClient');
const { logger } = require('@qualiguali/shared');

// ExecutionUpdated doesn't carry projectId (a gap in Parte 3's event — see
// README), so the first time we see a cycleId we resolve it once from
// execution-service and every CycleReport write after that is local-only.
async function resolveProjectIdForCycle(cycleId) {
  const existing = await CycleReport.findOne({ cycleId }, 'projectId');
  if (existing) return existing.projectId;

  try {
    const cycle = await executionClient.getExecutionCycle(cycleId);
    return cycle ? cycle.projectId : null;
  } catch (err) {
    logger.error('Could not resolve projectId for cycle', { cycleId, error: err.message });
    return null;
  }
}

// A defect only carries linkedExecutionId or linkedAutomationTestResultId —
// neither is a cycleId. The execution path is resolvable purely from local
// indexes built from already-published events; the automation path needs one
// live call to execution-service (no event carries testResult -> run).
async function resolveCycleIdForDefect({ linkedExecutionId, linkedAutomationTestResultId }) {
  if (linkedExecutionId) {
    const index = await ExecutionIndex.findById(linkedExecutionId);
    return index ? { cycleId: index.cycleId, projectId: index.projectId } : null;
  }

  if (linkedAutomationTestResultId) {
    let testResult;
    try {
      testResult = await executionClient.getAutomationTestResult(linkedAutomationTestResultId);
    } catch (err) {
      logger.error('Could not resolve linkedAutomationTestResultId', {
        linkedAutomationTestResultId,
        error: err.message,
      });
      return null;
    }
    if (!testResult) return null;

    const runIndex = await AutomationRunIndex.findById(testResult.automationRunId);
    if (!runIndex || !runIndex.cycleId) return null;
    return { cycleId: runIndex.cycleId, projectId: runIndex.projectId };
  }

  return null;
}

module.exports = { resolveProjectIdForCycle, resolveCycleIdForDefect };
