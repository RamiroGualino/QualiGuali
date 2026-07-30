const env = require('../config/env');
const { issueServiceToken } = require('../utils/serviceToken');

async function getTestCase(testCaseId) {
  let response;
  try {
    response = await fetch(`${env.qaCoreServiceUrl}/test-cases/${testCaseId}`, {
      headers: { Authorization: `Bearer ${issueServiceToken()}` },
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

  const body = await response.json();
  return body.testCase;
}

module.exports = { getTestCase };
