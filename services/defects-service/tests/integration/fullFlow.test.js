// End-to-end flow required by the Parte 5 acceptance criteria: take a
// failed Execution from Parte 3 -> create a linked defect -> change its
// status -> add a comment. projects-service and execution-service are
// mocked here per the same pattern used since Parte 2.
jest.mock('../../src/clients/projectsClient');
jest.mock('../../src/clients/executionClient');
jest.mock('../../src/services/events');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const projectsClient = require('../../src/clients/projectsClient');
const executionClient = require('../../src/clients/executionClient');
const events = require('../../src/services/events');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const token = tokenFor({ role: ROLES.QA_ENGINEER });
const authHeader = `Bearer ${token}`;

beforeAll(async () => testDb.connect());
afterAll(async () => testDb.closeDatabase());

test('full flow: failed Execution -> linked defect -> status change -> comment', async () => {
  projectsClient.getProject.mockResolvedValue({ _id: 'proj-e2e' });
  executionClient.getExecution.mockResolvedValue({
    _id: 'exec-e2e',
    status: 'fail',
    testCaseId: 'tc-e2e',
  });

  const createRes = await request(app).post('/defects').set('Authorization', authHeader).send({
    projectId: 'proj-e2e',
    title: 'Checkout fails with credit card',
    description: 'Reported from a failed manual execution',
    severity: 'critical',
    linkedExecutionId: 'exec-e2e',
  });
  expect(createRes.status).toBe(201);
  const defectId = createRes.body.defect._id;
  expect(createRes.body.defect.code).toBe('DEF-001');

  const statusRes = await request(app)
    .patch(`/defects/${defectId}/status`)
    .set('Authorization', authHeader)
    .send({ status: 'in_progress' });
  expect(statusRes.status).toBe(200);
  expect(statusRes.body.defect.status).toBe('in_progress');

  const commentRes = await request(app)
    .post(`/defects/${defectId}/comments`)
    .set('Authorization', authHeader)
    .send({ text: 'Confirmed the root cause is a null pointer in the payment gateway client' });
  expect(commentRes.status).toBe(201);

  const commentsRes = await request(app)
    .get(`/defects/${defectId}/comments`)
    .set('Authorization', authHeader);
  expect(commentsRes.body.comments).toHaveLength(1);

  expect(events.publish).toHaveBeenCalledWith(
    'DefectCreated',
    expect.objectContaining({ defectId, linkedExecutionId: 'exec-e2e' }),
  );
  expect(events.publish).toHaveBeenCalledWith(
    'DefectStatusChanged',
    expect.objectContaining({ defectId, fromStatus: 'open', toStatus: 'in_progress' }),
  );
});
