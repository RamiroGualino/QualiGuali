const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/notifications.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

router.get('/', controller.getNotifications);
router.patch('/:id/read', controller.markNotificationRead);
router.post('/mark-all-read', controller.markAllNotificationsRead);

module.exports = router;
