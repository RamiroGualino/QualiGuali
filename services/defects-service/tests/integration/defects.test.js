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
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

beforeAll(async () => testDb.connect());
afterEach(async () => {
  await testDb.clearDatabase();
  jest.resetAllMocks();
});
afterAll(async () => testDb.closeDatabase());

describe('POST /defects', () => {
  test('creates a defect with an auto-generated code and publishes DefectCreated', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Login fails on Safari', severity: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.defect.code).toBe('DEF-001');
    expect(res.body.defect.status).toBe('open');
    expect(res.body.defect.reportedBy).toEqual(expect.any(String));

    expect(events.publish).toHaveBeenCalledWith(
      'DefectCreated',
      expect.objectContaining({
        defectId: res.body.defect._id,
        projectId: 'proj-1',
        severity: 'high',
      }),
    );
  });

  test('assigns sequential codes per project', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const first = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'First', severity: 'low' });
    const second = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Second', severity: 'low' });

    expect(first.body.defect.code).toBe('DEF-001');
    expect(second.body.defect.code).toBe('DEF-002');
  });

  test('rejects an invalid severity', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Bad severity', severity: 'urgent' });

    expect(res.status).toBe(400);
  });

  test('rejects a missing title with 400', async () => {
    const res = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', severity: 'low' });

    expect(res.status).toBe(400);
    expect(projectsClient.getProject).not.toHaveBeenCalled();
  });

  test('rejects when the project does not exist', async () => {
    projectsClient.getProject.mockResolvedValue(null);

    const res = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'missing', title: 'Orphan defect', severity: 'low' });

    expect(res.status).toBe(400);
  });

  test('persists an optional jiraUrl', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });

    const res = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        title: 'Linked to Jira',
        severity: 'medium',
        jiraUrl: 'https://jira.example.com/browse/QG-42',
      });

    expect(res.status).toBe(201);
    expect(res.body.defect.jiraUrl).toBe('https://jira.example.com/browse/QG-42');
  });

  test('rejects requests without a token', async () => {
    const res = await request(app)
      .post('/defects')
      .send({ projectId: 'proj-1', title: 'No token', severity: 'low' });

    expect(res.status).toBe(401);
  });

  test('creates a defect linked to a failed Execution', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    executionClient.getExecution.mockResolvedValue({ _id: 'exec-1', status: 'fail' });

    const res = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        title: 'Checkout fails',
        severity: 'critical',
        linkedExecutionId: 'exec-1',
      });

    expect(res.status).toBe(201);
    expect(res.body.defect.linkedExecutionId).toBe('exec-1');
    expect(executionClient.getExecution).toHaveBeenCalledWith('exec-1', expect.any(String));
  });

  test('rejects a linkedExecutionId that does not exist', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    executionClient.getExecution.mockResolvedValue(null);

    const res = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        title: 'Bad link',
        severity: 'low',
        linkedExecutionId: 'missing-exec',
      });

    expect(res.status).toBe(400);
  });

  test('creates a defect linked to a failed AutomationTestResult', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    executionClient.getAutomationTestResult.mockResolvedValue({ _id: 'atr-1', status: 'failed' });

    const res = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        title: 'API returns 500',
        severity: 'high',
        linkedAutomationTestResultId: 'atr-1',
      });

    expect(res.status).toBe(201);
    expect(res.body.defect.linkedAutomationTestResultId).toBe('atr-1');
  });

  test('rejects a linkedAutomationTestResultId that does not exist', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    executionClient.getAutomationTestResult.mockResolvedValue(null);

    const res = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({
        projectId: 'proj-1',
        title: 'Bad automation link',
        severity: 'low',
        linkedAutomationTestResultId: 'missing-atr',
      });

    expect(res.status).toBe(400);
  });
});

describe('GET /defects', () => {
  test('filters by projectId, status, severity and linkedExecutionId', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    executionClient.getExecution.mockResolvedValue({ _id: 'exec-1' });

    await request(app).post('/defects').set('Authorization', `Bearer ${qaToken()}`).send({
      projectId: 'proj-1',
      title: 'Linked one',
      severity: 'high',
      linkedExecutionId: 'exec-1',
    });
    await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Unrelated', severity: 'low' });

    const res = await request(app)
      .get('/defects?projectId=proj-1&severity=high&linkedExecutionId=exec-1')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.defects).toHaveLength(1);
    expect(res.body.defects[0].title).toBe('Linked one');
  });
});

describe('GET /defects/:id', () => {
  test('returns 404 for a non-existent defect', async () => {
    const res = await request(app)
      .get('/defects/64b6f7e2f1a2b3c4d5e6f7a8')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /defects/:id', () => {
  test('updates title/description/severity/assignedTo', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const created = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Original', severity: 'low' });

    const res = await request(app)
      .patch(`/defects/${created.body.defect._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ title: 'Renamed', severity: 'critical', assignedTo: 'user-2' });

    expect(res.status).toBe(200);
    expect(res.body.defect.title).toBe('Renamed');
    expect(res.body.defect.severity).toBe('critical');
    expect(res.body.defect.assignedTo).toBe('user-2');
  });

  test('updates jiraUrl', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const created = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Original', severity: 'low' });

    const res = await request(app)
      .patch(`/defects/${created.body.defect._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ jiraUrl: 'https://jira.example.com/browse/QG-99' });

    expect(res.status).toBe(200);
    expect(res.body.defect.jiraUrl).toBe('https://jira.example.com/browse/QG-99');
  });

  test('rejects trying to change status via the generic PATCH', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const created = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'Protected', severity: 'low' });

    const res = await request(app)
      .patch(`/defects/${created.body.defect._id}`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /defects/:id', () => {
  test('deletes an existing defect', async () => {
    projectsClient.getProject.mockResolvedValue({ _id: 'proj-1' });
    const created = await request(app)
      .post('/defects')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1', title: 'To delete', severity: 'low' });

    const res = await request(app)
      .delete(`/defects/${created.body.defect._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(204);

    const getRes = await request(app)
      .get(`/defects/${created.body.defect._id}`)
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(getRes.status).toBe(404);
  });
});
