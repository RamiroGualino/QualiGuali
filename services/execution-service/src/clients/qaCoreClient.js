const env = require('../config/env');

// qa-core-service requires a valid JWT on every route, so we forward the
// caller's own Authorization header rather than minting a separate
// service-to-service credential (same pattern as Parte 2's projectsClient).
async function requestJson(path, authorization) {
  let response;
  try {
    response = await fetch(`${env.qaCoreServiceUrl}${path}`, {
      headers: authorization ? { Authorization: authorization } : {},
    });
  } catch (err) {
    const wrapped = new Error(`Failed to reach qa-core-service: ${err.message}`);
    wrapped.status = 502;
    throw wrapped;
  }

  if (response.status === 404) return null;

  if (!response.ok) {
    const err = new Error(`qa-core-service responded with ${response.status}`);
    err.status = 502;
    throw err;
  }

  return response.json();
}

async function getTestCase(testCaseId, authorization) {
  const body = await requestJson(`/test-cases/${testCaseId}`, authorization);
  return body ? body.testCase : null;
}

async function getTestPlan(testPlanId, authorization) {
  const body = await requestJson(`/test-plans/${testPlanId}`, authorization);
  return body ? body.testPlan : null;
}

// All test cases transitively linked to a Requirement through its Test
// Suites (Requirement 1—N TestSuite 1—N TestCase). Returns [] rather than
// null for a requirement with no suites yet — same shape either way.
async function getRequirementTestCases(requirementId, authorization) {
  const body = await requestJson(`/requirements/${requirementId}/test-cases`, authorization);
  return body ? body.testCases : null;
}

// Resolves a Cycle's "desde Requerimientos" source: for each requirementId,
// pull in every test case under its suites, deduped across requirements
// (the same case can't belong to more than one suite, but a cycle could
// still name two requirements that happen to share... nothing today, this
// is just defensive).
async function resolveTestCaseIdsFromRequirements(requirementIds, authorization) {
  const testCaseIdSet = new Set();
  for (const requirementId of requirementIds) {
    const testCases = await getRequirementTestCases(requirementId, authorization);
    if (testCases === null) {
      const err = new Error(`Requirement "${requirementId}" not found in qa-core-service`);
      err.status = 400;
      throw err;
    }
    testCases.forEach((testCase) => testCaseIdSet.add(testCase._id));
  }
  return Array.from(testCaseIdSet);
}

module.exports = {
  getTestCase,
  getTestPlan,
  getRequirementTestCases,
  resolveTestCaseIdsFromRequirements,
};
