const env = require('../config/env');
const { issueServiceToken } = require('../utils/serviceToken');

async function requestJson(path) {
  let response;
  try {
    response = await fetch(`${env.executionServiceUrl}${path}`, {
      headers: { Authorization: `Bearer ${issueServiceToken()}` },
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

async function getExecutionCycle(cycleId) {
  const body = await requestJson(`/execution-cycles/${cycleId}`);
  return body ? body.executionCycle : null;
}

async function getAutomationTestResult(testResultId) {
  const body = await requestJson(`/execution/automation-test-results/${testResultId}`);
  return body ? body.testResult : null;
}

async function getAutomationRun(automationRunId) {
  const body = await requestJson(`/execution/automation-runs/${automationRunId}`);
  return body ? body.automationRun : null;
}

async function getAutomationRunTests(automationRunId) {
  const body = await requestJson(`/execution/automation-runs/${automationRunId}/tests`);
  return body ? body.testResults : [];
}

async function getExecutionEvidence(executionId) {
  const body = await requestJson(`/executions/${executionId}/evidence`);
  return body ? body.evidence : [];
}

module.exports = {
  getExecutionCycle,
  getAutomationTestResult,
  getAutomationRun,
  getAutomationRunTests,
  getExecutionEvidence,
};
