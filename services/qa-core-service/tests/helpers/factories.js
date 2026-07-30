const request = require('supertest');
const createApp = require('../../src/app');
const { tokenFor } = require('./token');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

async function createRequirement(projectId, overrides = {}) {
  const res = await request(app)
    .post('/requirements')
    .set('Authorization', `Bearer ${qaToken()}`)
    .send({ projectId, title: 'Requirement', ...overrides });
  return res.body.requirement;
}

async function createTestSuite(projectId, requirementId, overrides = {}) {
  const res = await request(app)
    .post('/test-suites')
    .set('Authorization', `Bearer ${qaToken()}`)
    .send({ projectId, requirementId, name: 'Suite', ...overrides });
  return res.body.testSuite;
}

// Convenience for tests that only care about having *a* valid suiteId —
// creates the Requirement + TestSuite it hangs off of too.
async function createRequirementWithSuite(projectId) {
  const requirement = await createRequirement(projectId);
  const testSuite = await createTestSuite(projectId, requirement._id);
  return { requirement, testSuite };
}

async function createTestCase(projectId, overrides = {}) {
  let suiteId = overrides.suiteId;
  if (!suiteId) {
    const { testSuite } = await createRequirementWithSuite(projectId);
    suiteId = testSuite._id;
  }

  const res = await request(app)
    .post('/test-cases')
    .set('Authorization', `Bearer ${qaToken()}`)
    .send({ projectId, title: 'Test case', ...overrides, suiteId });
  return res.body.testCase;
}

module.exports = {
  createRequirement,
  createTestSuite,
  createRequirementWithSuite,
  createTestCase,
};
