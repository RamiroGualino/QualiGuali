// End-to-end flow required by the Part 2 acceptance criteria:
// crear proyecto (mocked, owned by projects-service) → crear requerimiento →
// crear plantilla → crear caso de prueba con customFields → armar plan de
// prueba. The projects-service call is mocked here per the prompt's explicit
// instruction; a real cross-process run is documented as a manual smoke test
// in the README (scripts/e2e-smoke.js) since it needs both services live.
jest.mock('../../src/clients/projectsClient');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const projectsClient = require('../../src/clients/projectsClient');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const token = tokenFor({ role: ROLES.QA_ENGINEER });
const authHeader = `Bearer ${token}`;

beforeAll(async () => testDb.connect());
afterAll(async () => testDb.closeDatabase());

test('full flow: requirement -> suite -> template -> test case with customFields -> test plan', async () => {
  const projectId = 'proj-e2e';
  const moduleId = 'module-e2e';
  projectsClient.getProject.mockResolvedValue({ _id: projectId, name: 'E2E project' });
  projectsClient.getModule.mockResolvedValue({ _id: moduleId, projectId, name: 'Checkout' });

  const requirementRes = await request(app)
    .post('/requirements')
    .set('Authorization', authHeader)
    .send({ projectId, moduleId, title: 'User can pay with credit card', priority: 'high' });
  expect(requirementRes.status).toBe(201);
  expect(requirementRes.body.requirement.code).toBe('REQ-001');

  const suiteRes = await request(app).post('/test-suites').set('Authorization', authHeader).send({
    projectId,
    requirementId: requirementRes.body.requirement._id,
    name: 'Credit card payments',
  });
  expect(suiteRes.status).toBe(201);

  const suiteTestCasesRes = await request(app)
    .get(`/requirements/${requirementRes.body.requirement._id}/test-cases`)
    .set('Authorization', authHeader);
  expect(suiteTestCasesRes.status).toBe(200);
  expect(suiteTestCasesRes.body.testCases).toEqual([]);

  const templateRes = await request(app)
    .post('/test-case-templates')
    .set('Authorization', authHeader)
    .send({
      projectId,
      name: 'Payments template',
      fields: [
        { key: 'paymentMethod', label: 'Payment method', type: 'text', required: true },
        { key: 'amount', label: 'Amount', type: 'number', required: true },
      ],
    });
  expect(templateRes.status).toBe(201);
  const templateId = templateRes.body.template._id;

  const testCaseRes = await request(app)
    .post('/test-cases')
    .set('Authorization', authHeader)
    .send({
      projectId,
      moduleId,
      suiteId: suiteRes.body.testSuite._id,
      templateId,
      title: 'Pay with valid credit card',
      preconditions: 'Cart has at least one item',
      steps: [
        { order: 1, action: 'Go to checkout', expectedResult: 'Checkout page loads' },
        { order: 2, action: 'Submit payment', expectedResult: 'Payment is accepted' },
      ],
      customFields: { paymentMethod: 'credit_card', amount: 100 },
    });
  expect(testCaseRes.status).toBe(201);
  expect(testCaseRes.body.testCase.code).toBe('TC-001');

  const suiteTestCasesAfterRes = await request(app)
    .get(`/requirements/${requirementRes.body.requirement._id}/test-cases`)
    .set('Authorization', authHeader);
  expect(suiteTestCasesAfterRes.status).toBe(200);
  expect(suiteTestCasesAfterRes.body.testCases).toHaveLength(1);
  expect(suiteTestCasesAfterRes.body.testCases[0]._id).toBe(testCaseRes.body.testCase._id);

  const testPlanRes = await request(app)
    .post('/test-plans')
    .set('Authorization', authHeader)
    .send({ projectId, name: 'Release 1.0 regression' });
  expect(testPlanRes.status).toBe(201);

  const addToPlanRes = await request(app)
    .post(`/test-plans/${testPlanRes.body.testPlan._id}/test-cases`)
    .set('Authorization', authHeader)
    .send({ testCaseIds: [testCaseRes.body.testCase._id] });
  expect(addToPlanRes.status).toBe(200);
  expect(addToPlanRes.body.testPlan.testCaseIds).toEqual([testCaseRes.body.testCase._id]);
});
