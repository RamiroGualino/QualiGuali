const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// GET /notifications?projectId=&isRead=&limit= — the doc only asks for a
// list endpoint, but the frontend badge needs an unread count on every
// poll, so it's returned alongside the list rather than requiring a second
// request (or a client-side count() over a possibly-paginated list).
async function getNotifications(req, res, next) {
  try {
    const { projectId, isRead, limit } = req.query;
    if (!projectId) {
      return res.status(400).json({ message: 'projectId is required' });
    }

    const filter = { projectId };
    if (isRead !== undefined) filter.isRead = isRead === 'true';

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit ? Number(limit) : 50);
    const unreadCount = await Notification.countDocuments({ projectId, isRead: false });

    return res.status(200).json({ notifications, unreadCount });
  } catch (err) {
    return next(err);
  }
}

// PATCH /notifications/:id/read — marks a single notification read. Not in
// the doc's own endpoint list, but isRead has no way to ever become true
// without it — the badge would stay stuck at its first count forever.
async function markNotificationRead(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { returnDocument: 'after' },
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    return res.status(200).json({ notification });
  } catch (err) {
    return next(err);
  }
}

// POST /notifications/mark-all-read — same reasoning as above: a "clear the
// badge" action is the normal way a user dismisses a batch of alerts, and
// marking each one individually from the frontend would mean one request
// per notification instead of one for the whole project.
async function markAllNotificationsRead(req, res, next) {
  try {
    const { projectId } = req.body;
    if (!projectId) {
      return res.status(400).json({ message: 'projectId is required' });
    }
    await Notification.updateMany({ projectId, isRead: false }, { isRead: true });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { getNotifications, markNotificationRead, markAllNotificationsRead };
