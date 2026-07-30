// End-to-end flow required by the Parte 3 acceptance criteria:
// crear ciclo desde un plan de la Parte 2 -> ejecutar -> adjuntar evidencia
// -> cerrar ciclo -> verificar que se publicaron los eventos. qa-core-service
// and S3/MinIO are mocked here per the same pattern used in Parte 2; a real
// cross-process run is documented as a manual smoke test in the README.
jest.mock('../../src/clients/qaCoreClient');
jest.mock('../../src/clients/s3Client');
jest.mock('../../src/services/events');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const qaCoreClient = require('../../src/clients/qaCoreClient');
const s3Client = require('../../src/clients/s3Client');
const events = require('../../src/services/events');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const token = tokenFor({ role: ROLES.QA_ENGINEER });
const authHeader = `Bearer ${token}`;

beforeAll(async () => testDb.connect());
afterAll(async () => testDb.closeDatabase());

test('full flow: cycle from plan -> execute -> evidence -> close -> events published', async () => {
  qaCoreClient.getTestPlan.mockResolvedValue({
    _id: 'plan-e2e',
    testCaseIds: ['tc-1', 'tc-2'],
  });
  qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });
  s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/e2e.png');

  const cycleRes = await request(app)
    .post('/execution-cycles')
    .set('Authorization', authHeader)
    .send({ projectId: 'proj-e2e', testPlanId: 'plan-e2e', name: 'Release 1.0 cycle' });
  expect(cycleRes.status).toBe(201);
  const cycleId = cycleRes.body.executionCycle._id;

  const executionsRes = await request(app)
    .get(`/execution-cycles/${cycleId}/executions`)
    .set('Authorization', authHeader);
  expect(executionsRes.body.executions).toHaveLength(2);
  const [firstExecution, secondExecution] = executionsRes.body.executions;

  const passRes = await request(app)
    .patch(`/executions/${firstExecution._id}`)
    .set('Authorization', authHeader)
    .send({ status: 'pass', comments: 'All good' });
  expect(passRes.status).toBe(200);

  const evidenceRes = await request(app)
    .post(`/executions/${firstExecution._id}/evidence`)
    .set('Authorization', authHeader)
    .attach('file', Buffer.from('fake-screenshot'), {
      filename: 'proof.png',
      contentType: 'image/png',
    });
  expect(evidenceRes.status).toBe(201);

  const failRes = await request(app)
    .patch(`/executions/${secondExecution._id}`)
    .set('Authorization', authHeader)
    .send({ status: 'fail', comments: 'Broken' });
  expect(failRes.status).toBe(200);

  const closeRes = await request(app)
    .post(`/execution-cycles/${cycleId}/close`)
    .set('Authorization', authHeader)
    .send({});
  expect(closeRes.status).toBe(200);
  expect(closeRes.body.executionCycle.status).toBe('closed');

  expect(events.publish).toHaveBeenCalledWith(
    'ExecutionUpdated',
    expect.objectContaining({ executionId: firstExecution._id, status: 'pass' }),
  );
  expect(events.publish).toHaveBeenCalledWith(
    'ExecutionUpdated',
    expect.objectContaining({ executionId: secondExecution._id, status: 'fail' }),
  );
  expect(events.publish).toHaveBeenCalledWith(
    'CycleFinished',
    expect.objectContaining({ cycleId, projectId: 'proj-e2e' }),
  );
});
