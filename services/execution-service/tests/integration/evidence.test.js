jest.mock('../../src/clients/qaCoreClient');
jest.mock('../../src/services/events');
jest.mock('../../src/clients/s3Client');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const qaCoreClient = require('../../src/clients/qaCoreClient');
const s3Client = require('../../src/clients/s3Client');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

async function createExecution() {
  qaCoreClient.getTestPlan.mockResolvedValue({ _id: 'plan-1', testCaseIds: ['tc-1'] });
  qaCoreClient.getTestCase.mockResolvedValue({ _id: 'tc-1' });

  const cycle = await request(app)
    .post('/execution-cycles')
    .set('Authorization', `Bearer ${qaToken()}`)
    .send({ projectId: 'proj-1', testPlanId: 'plan-1', name: 'Cycle' });

  const executions = await request(app)
    .get(`/execution-cycles/${cycle.body.executionCycle._id}/executions`)
    .set('Authorization', `Bearer ${qaToken()}`);
  return executions.body.executions[0];
}

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('POST /executions/:id/evidence', () => {
  test('uploads a file to S3/MinIO and infers fileType from the mimetype', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    const res = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: 'screenshot.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    expect(res.body.evidence.fileType).toBe('image');
    expect(res.body.evidence.fileUrl).toBe('http://minio.local/qualiguali-evidence/some-key.png');
    expect(s3Client.uploadObject).toHaveBeenCalledWith(
      expect.stringContaining(`executions/${execution._id}/`),
      expect.any(Buffer),
      'image/png',
    );
  });

  test('accepts an explicit fileType override', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/log.txt');

    const res = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('fileType', 'log')
      .attach('file', Buffer.from('log contents'), {
        filename: 'run.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(201);
    expect(res.body.evidence.fileType).toBe('log');
  });

  test('rejects a request with no file attached', async () => {
    const execution = await createExecution();

    const res = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(400);
    expect(s3Client.uploadObject).not.toHaveBeenCalled();
  });

  test('returns 404 for a non-existent execution (never orphaned evidence)', async () => {
    const res = await request(app)
      .post('/executions/64b6f7e2f1a2b3c4d5e6f7a8/evidence')
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('data'), { filename: 'x.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
    expect(s3Client.uploadObject).not.toHaveBeenCalled();
  });

  test('leaves executionHistoryId null when no result has been registered yet', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    const res = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.evidence.executionHistoryId).toBeNull();
  });

  test('is claimed by the already-existing latest attempt when uploaded after the fact', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'fail' });

    const history = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const res = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.evidence.executionHistoryId).toBe(history.body.history[0]._id);
  });

  test('is claimed by the ExecutionHistory row created for the first submitted result', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    const uploaded = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'fail' });

    const history = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const evidenceList = await request(app)
      .get(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const claimed = evidenceList.body.evidence.find(
      (item) => item._id === uploaded.body.evidence._id,
    );
    expect(claimed.executionHistoryId).toBe(history.body.history[0]._id);
  });

  test('attaches to an explicitly named (non-latest) attempt via executionHistoryId', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'fail', comments: 'First attempt' });
    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass', comments: 'Fixed and re-tested' });

    const history = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);
    const oldestEntryId = history.body.history[1]._id;

    const res = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('executionHistoryId', oldestEntryId)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.evidence.executionHistoryId).toBe(oldestEntryId);
  });

  test('rejects an executionHistoryId that belongs to a different execution', async () => {
    const execution = await createExecution();
    const otherExecution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    await request(app)
      .patch(`/executions/${otherExecution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'pass' });
    const otherHistory = await request(app)
      .get(`/executions/${otherExecution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const res = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .field('executionHistoryId', otherHistory.body.history[0]._id)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
    expect(s3Client.uploadObject).not.toHaveBeenCalled();
  });
});

describe('PATCH /executions/:id/evidence/:evidenceId', () => {
  test('replaces the fileUrl/fileType of an existing evidence row in place', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValueOnce(
      'http://minio.local/qualiguali-evidence/original.png',
    );

    const uploaded = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('original'), { filename: 'a.png', contentType: 'image/png' });

    s3Client.uploadObject.mockResolvedValueOnce(
      'http://minio.local/qualiguali-evidence/annotated.png',
    );

    const res = await request(app)
      .patch(`/executions/${execution._id}/evidence/${uploaded.body.evidence._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('annotated'), {
        filename: 'a-annotated.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(res.body.evidence._id).toBe(uploaded.body.evidence._id);
    expect(res.body.evidence.fileUrl).toBe('http://minio.local/qualiguali-evidence/annotated.png');
  });

  test('keeps the same executionHistoryId association after being replaced', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    const uploaded = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    await request(app)
      .patch(`/executions/${execution._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'fail' });

    const history = await request(app)
      .get(`/executions/${execution._id}/history`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const res = await request(app)
      .patch(`/executions/${execution._id}/evidence/${uploaded.body.evidence._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('annotated'), { filename: 'b.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.evidence.executionHistoryId).toBe(history.body.history[0]._id);
  });

  test('returns 404 for a non-existent evidence row', async () => {
    const execution = await createExecution();

    const res = await request(app)
      .patch(`/executions/${execution._id}/evidence/64b6f7e2f1a2b3c4d5e6f7a8`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
    expect(s3Client.uploadObject).not.toHaveBeenCalled();
  });

  test('rejects a request with no file attached', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    const uploaded = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    const res = await request(app)
      .patch(`/executions/${execution._id}/evidence/${uploaded.body.evidence._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(400);
  });
});

describe('DELETE /executions/:id/evidence/:evidenceId', () => {
  test('removes the evidence row', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    const uploaded = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    const res = await request(app)
      .delete(`/executions/${execution._id}/evidence/${uploaded.body.evidence._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(204);

    const evidenceList = await request(app)
      .get(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(evidenceList.body.evidence).toHaveLength(0);
  });

  test('leaves other evidence on the same attempt untouched', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    const first = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('one'), { filename: 'a.png', contentType: 'image/png' });
    const second = await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('two'), { filename: 'b.png', contentType: 'image/png' });

    await request(app)
      .delete(`/executions/${execution._id}/evidence/${first.body.evidence._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    const evidenceList = await request(app)
      .get(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(evidenceList.body.evidence).toHaveLength(1);
    expect(evidenceList.body.evidence[0]._id).toBe(second.body.evidence._id);
  });

  test('returns 404 for an evidence row that does not belong to this execution', async () => {
    const execution = await createExecution();
    const otherExecution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    const uploaded = await request(app)
      .post(`/executions/${otherExecution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    const res = await request(app)
      .delete(`/executions/${execution._id}/evidence/${uploaded.body.evidence._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(404);
  });

  test('returns 404 for a non-existent evidence row', async () => {
    const execution = await createExecution();

    const res = await request(app)
      .delete(`/executions/${execution._id}/evidence/64b6f7e2f1a2b3c4d5e6f7a8`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /executions/:id/evidence', () => {
  test('lists evidence uploaded for an execution', async () => {
    const execution = await createExecution();
    s3Client.uploadObject.mockResolvedValue('http://minio.local/qualiguali-evidence/some-key.png');

    await request(app)
      .post(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .attach('file', Buffer.from('fake'), { filename: 'a.png', contentType: 'image/png' });

    const res = await request(app)
      .get(`/executions/${execution._id}/evidence`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.evidence).toHaveLength(1);
  });
});
