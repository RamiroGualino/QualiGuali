jest.mock('../../src/clients/projectsClient');
jest.mock('../../src/services/events');

const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const projectsClient = require('../../src/clients/projectsClient');
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

describe('POST /defects/:id/comments', () => {
  test('adds a comment authored by the current user', async () => {
    const defect = await createDefect();

    const res = await request(app)
      .post(`/defects/${defect._id}/comments`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ text: 'Reproduced on staging' });

    expect(res.status).toBe(201);
    expect(res.body.comment.text).toBe('Reproduced on staging');
    expect(res.body.comment.authorId).toEqual(expect.any(String));
  });

  test('rejects a missing text with 400', async () => {
    const defect = await createDefect();

    const res = await request(app)
      .post(`/defects/${defect._id}/comments`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('returns 404 for a non-existent defect', async () => {
    const res = await request(app)
      .post('/defects/64b6f7e2f1a2b3c4d5e6f7a8/comments')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ text: 'Orphan comment' });

    expect(res.status).toBe(404);
  });
});

describe('GET /defects/:id/comments', () => {
  test('lists comments in chronological order', async () => {
    const defect = await createDefect();

    await request(app)
      .post(`/defects/${defect._id}/comments`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ text: 'First comment' });
    await request(app)
      .post(`/defects/${defect._id}/comments`)
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ text: 'Second comment' });

    const res = await request(app)
      .get(`/defects/${defect._id}/comments`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.comments.map((c) => c.text)).toEqual(['First comment', 'Second comment']);
  });
});
