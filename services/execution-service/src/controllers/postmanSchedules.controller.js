const mongoose = require('mongoose');
const PostmanSchedule = require('../models/PostmanSchedule');
const PostmanSuite = require('../models/PostmanSuite');
const { isValidCronExpression } = require('../services/cronSchedule.service');
const { registerSchedule, unregisterSchedule } = require('../services/postmanScheduler.service');

const UPDATABLE_FIELDS = ['cronExpression', 'timezone', 'isActive'];

async function createPostmanSchedule(req, res, next) {
  try {
    const { suiteId, cronExpression, timezone, isActive } = req.body;
    if (!suiteId || !mongoose.isValidObjectId(suiteId)) {
      return res.status(400).json({ message: 'A valid suiteId is required' });
    }
    if (!cronExpression) {
      return res.status(400).json({ message: 'cronExpression is required' });
    }
    if (!isValidCronExpression(cronExpression)) {
      return res
        .status(400)
        .json({ message: `"${cronExpression}" is not a valid cron expression` });
    }

    const suite = await PostmanSuite.findById(suiteId);
    if (!suite) {
      return res.status(400).json({ message: `Postman suite "${suiteId}" not found` });
    }

    const postmanSchedule = await PostmanSchedule.create({
      suiteId,
      projectId: suite.projectId,
      cronExpression,
      timezone: timezone || undefined,
      isActive: isActive === undefined ? undefined : Boolean(isActive),
      createdBy: req.auth.userId,
    });

    // Hot-reload: registers the real node-cron task immediately, no restart
    // needed (etapa-6 "Bootstrap y recarga" §2).
    registerSchedule(postmanSchedule);

    return res.status(201).json({ postmanSchedule });
  } catch (err) {
    return next(err);
  }
}

async function listPostmanSchedules(req, res, next) {
  try {
    const { suiteId, projectId, isActive } = req.query;
    const filter = {};
    if (suiteId) {
      if (!mongoose.isValidObjectId(suiteId)) {
        return res.status(400).json({ message: `suiteId "${suiteId}" is not a valid id` });
      }
      filter.suiteId = suiteId;
    }
    if (projectId) filter.projectId = projectId;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const postmanSchedules = await PostmanSchedule.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ postmanSchedules });
  } catch (err) {
    return next(err);
  }
}

async function updatePostmanSchedule(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Postman schedule not found' });
    }

    if (req.body.cronExpression !== undefined && !isValidCronExpression(req.body.cronExpression)) {
      return res
        .status(400)
        .json({ message: `"${req.body.cronExpression}" is not a valid cron expression` });
    }

    const updates = {};
    UPDATABLE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const postmanSchedule = await PostmanSchedule.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!postmanSchedule) {
      return res.status(404).json({ message: 'Postman schedule not found' });
    }

    // Re-registering unconditionally covers every case a PATCH can produce:
    // a cron/timezone change (stop the old task, start a new one), isActive
    // flipped either direction (registerSchedule() itself only (re)starts
    // the task when isActive is true, and always unregisters first).
    registerSchedule(postmanSchedule);

    return res.status(200).json({ postmanSchedule });
  } catch (err) {
    return next(err);
  }
}

async function deletePostmanSchedule(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Postman schedule not found' });
    }
    const postmanSchedule = await PostmanSchedule.findByIdAndDelete(req.params.id);
    if (!postmanSchedule) {
      return res.status(404).json({ message: 'Postman schedule not found' });
    }

    unregisterSchedule(postmanSchedule._id);

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createPostmanSchedule,
  listPostmanSchedules,
  updatePostmanSchedule,
  deletePostmanSchedule,
};
