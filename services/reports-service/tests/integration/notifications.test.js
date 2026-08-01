const request = require('supertest');
const createApp = require('../../src/app');
const testDb = require('../helpers/testDb');
const { tokenFor } = require('../helpers/token');
const Notification = require('../../src/models/Notification');
const { ROLES } = require('@qualiguali/shared');

const app = createApp();
const qaToken = () => tokenFor({ role: ROLES.QA_ENGINEER });

beforeAll(async () => testDb.connect());
afterEach(async () => testDb.clearDatabase());
afterAll(async () => testDb.closeDatabase());

function seedNotification(overrides = {}) {
  return Notification.create({
    projectId: 'proj-1',
    type: 'automation_run_failed',
    title: 'Automation run failed',
    message: '"Smoke API" had 1 failed test(s)',
    relatedAutomationRunId: 'run-1',
    isRead: false,
    ...overrides,
  });
}

describe('GET /notifications', () => {
  test('returns 401 without a token', async () => {
    const res = await request(app).get('/notifications?projectId=proj-1');
    expect(res.status).toBe(401);
  });

  test('requires a projectId', async () => {
    const res = await request(app)
      .get('/notifications')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(400);
  });

  test('lists notifications for a project, newest first, with an unread count', async () => {
    await seedNotification({ message: 'first', createdAt: new Date('2026-01-01') });
    await seedNotification({ message: 'second', createdAt: new Date('2026-01-02') });
    await seedNotification({ projectId: 'proj-2', message: 'other project' });
    await seedNotification({
      isRead: true,
      message: 'already read',
      createdAt: new Date('2025-12-31'),
    });

    const res = await request(app)
      .get('/notifications?projectId=proj-1')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(3);
    expect(res.body.notifications[0].message).toBe('second');
    expect(res.body.unreadCount).toBe(2);
  });

  test('filters by isRead', async () => {
    await seedNotification({ isRead: false });
    await seedNotification({ isRead: true });

    const res = await request(app)
      .get('/notifications?projectId=proj-1&isRead=false')
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0].isRead).toBe(false);
  });
});

describe('PATCH /notifications/:id/read', () => {
  test('marks a notification as read', async () => {
    const notification = await seedNotification();

    const res = await request(app)
      .patch(`/notifications/${notification._id}/read`)
      .set('Authorization', `Bearer ${qaToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.notification.isRead).toBe(true);
    expect(await Notification.findById(notification._id)).toMatchObject({ isRead: true });
  });

  test('returns 404 for a non-existent notification', async () => {
    const res = await request(app)
      .patch('/notifications/64b6f7e2f1a2b3c4d5e6f7a8/read')
      .set('Authorization', `Bearer ${qaToken()}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /notifications/mark-all-read', () => {
  test('marks every unread notification for a project as read, leaving other projects untouched', async () => {
    await seedNotification({ isRead: false });
    await seedNotification({ isRead: false });
    const otherProjectNotification = await seedNotification({ projectId: 'proj-2', isRead: false });

    const res = await request(app)
      .post('/notifications/mark-all-read')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({ projectId: 'proj-1' });

    expect(res.status).toBe(204);
    expect(await Notification.countDocuments({ projectId: 'proj-1', isRead: false })).toBe(0);
    expect(await Notification.findById(otherProjectNotification._id)).toMatchObject({
      isRead: false,
    });
  });

  test('requires a projectId', async () => {
    const res = await request(app)
      .post('/notifications/mark-all-read')
      .set('Authorization', `Bearer ${qaToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });
});
