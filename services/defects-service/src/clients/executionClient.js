const env = require('../config/env');

// execution-service requires a valid JWT on every route, so we forward the
// caller's own Authorization header rather than minting a separate
// service-to-service credential (same pattern used elsewhere).
async function requestJson(path, authorization) {
  let response;
  try {
    response = await fetch(`${env.executionServiceUrl}${path}`, {
      headers: authorization ? { Authorization: authorization } : {},
    });
  } catch (err) {
    const wrapped = new Error(`Failed to reach execution-service: ${err.message}`);
    wrapped.status = 502;
    throw wrapped;
  }

  if (response.status === 404) return null;

  if (!response.ok) {
    const err = new Error(`execution-service responded with ${response.status}`);
    err.status = 502;
    throw err;
  }

  return response.json();
}

async function getExecution(executionId, authorization) {
  const body = await requestJson(`/executions/${executionId}`, authorization);
  return body ? body.execution : null;
}

async function getAutomationTestResult(testResultId, authorization) {
  const body = await requestJson(
    `/execution/automation-test-results/${testResultId}`,
    authorization,
  );
  return body ? body.testResult : null;
}

module.exports = { getExecution, getAutomationTestResult };
