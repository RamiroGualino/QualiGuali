jest.mock('../../src/clients/projectsClient');
jest.mock('../../src/clients/executionClient');
jest.mock('../../src/services/events');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const projectsClient = require('../../src/clients/projectsClient');
const events = require('../../src/services/events');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

async function createDefect() {
  projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
  const res = await request(app)
    .post('/defects')
    .set('Authorization', `Bearer ${qaToken()}`)
    .send({ projectId: 'proj-1', title: 'Some bug', severity: 'medium' });
  return res.body.defect;
}

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('PATCH /defects/:id/status', () => {
  test('walks the full happy path open -> in_progress -> resolved -> closed', async () => {
    const defect = await createDefect();

    const toInProgress = await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'in_progress' });
    expect(toInProgress.status).toBe(200);
    expect(toInProgress.body.defect.status).toBe('in_progress');

    const toResolved = await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'resolved' });
    expect(toResolved.status).toBe(200);

    const toClosed = await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'closed' });
    expect(toClosed.status).toBe(200);
    expect(toClosed.body.defect.status).toBe('closed');

    expect(events.publish).toHaveBeenCalledWith(
      'DefectStatusChanged',
      expect.objectContaining({
        defectId: defect._id,
        fromStatus: 'open',
        toStatus: 'in_progress',
      }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      'DefectStatusChanged',
      expect.objectContaining({ fromStatus: 'resolved', toStatus: 'closed' }),
    );
  });

  test('supports reopening a closed defect back through in_progress', async () => {
    const defect = await createDefect();

    await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'in_progress' });
    await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'resolved' });
    await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'closed' });

    const reopened = await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'reopened' });
    expect(reopened.status).toBe(200);

    const backToInProgress = await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'in_progress' });
    expect(backToInProgress.status).toBe(200);
    expect(backToInProgress.body.defect.status).toBe('in_progress');
  });

  test('rejects an invalid transition (open -> closed) with 400', async () => {
    const defect = await createDefect();
    events.publish.mockClear(); // drop the DefectCreated call from createDefect()

    const res = await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(400);
    expect(events.publish).not.toHaveBeenCalled();
  });

  test('rejects a missing status with 400', async () => {
    const defect = await createDefect();

    const res = await request(app)
      .patch(`/defects/${defect._id}/status`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('returns 404 for a non-existent defect', async () => {
    const res = await request(app)
      .patch('/defects/64b6f7e2f1a2b3c4d5e6f7a8/status')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(404);
  });
});
