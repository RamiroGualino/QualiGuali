const express = require('express');
const { createAuthenticate, requireRole, ROLES } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/internalEvents.controller');

const router = express.Router();
// Only a service's own self-issued token (minted with this role — see
// createEventPublisher's issueLocalDeliveryToken) gets in here; a real
// user's JWT would need to actually hold super_admin, same as any other
// super-admin-only route in this app.
router.use(createAuthenticate(env.jwtSecret), requireRole(ROLES.SUPER_ADMIN));

router.post('/events', controller.receiveEvent);

module.exports = router;
