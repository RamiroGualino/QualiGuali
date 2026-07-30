const Execution = require('../models/Execution');
const qaCoreClient = require('../clients/qaCoreClient');

// Pure: given a cycleId and the testCaseIds from a TestPlan, build the
// not_executed Execution docs to precreate. Deduped defensively (the plan
// shouldn't have duplicates, but nothing upstream guarantees it).
function buildExecutionDocs(cycleId, testCaseIds = []) {
  const uniqueIds = Array.from(new Set(testCaseIds.map(String)));
  return uniqueIds.map((testCaseId) => ({
    cycleId,
    testCaseId,
    status: 'not_executed',
  }));
}

// Validates every testCaseId against qa-core-service (same cross-service
// validation pattern as Parte 2) before precreating the Executions. Used by
// both cycle-creation sources (from a Test Plan, or from Requirements) —
// each just resolves its own testCaseIds list beforehand.
async function bootstrapExecutions({ cycleId, testCaseIds, authorization }) {
  const docs = buildExecutionDocs(cycleId, testCaseIds);
  if (docs.length === 0) return [];

  const checks = await Promise.all(
    docs.map((doc) => qaCoreClient.getTestCase(doc.testCaseId, authorization)),
  );
  const missingIndex = checks.findIndex((testCase) => !testCase);
  if (missingIndex !== -1) {
    const err = new Error(
      `TestCase "${docs[missingIndex].testCaseId}" not found in qa-core-service`,
    );
    err.status = 400;
    throw err;
  }

  return Execution.insertMany(docs);
}

module.exports = { buildExecutionDocs, bootstrapExecutions };
