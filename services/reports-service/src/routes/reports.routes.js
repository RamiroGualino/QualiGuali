const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/reports.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

// Read-only by design: every write to this read-model comes from consuming
// domain events (via the SQS consumer, or POST /internal/events as a
// Docker/LocalStack-free local-dev stand-in — see internalEvents.routes.js),
// never from a public endpoint.
router.get('/cycles/:cycleId', controller.getCycleReport);
router.get('/cycles/:cycleId/failures', controller.getCycleFailures);
router.get('/projects/:projectId/trend', controller.getProjectTrend);

module.exports = router;
