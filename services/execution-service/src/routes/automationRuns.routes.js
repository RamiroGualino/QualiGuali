const express = require('express');
const multer = require('multer');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/automationRuns.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.automationUploadMaxBytes },
});

router.post('/automation-runs', upload.array('files', 500), controller.createAutomationRun);
router.get('/automation-runs', controller.listAutomationRuns);
router.get('/automation-runs/:id', controller.getAutomationRun);
router.get('/automation-runs/:id/tests', controller.listAutomationRunTests);
router.post('/automation-runs/:id/retry', controller.retryAutomationRun);
router.get('/automation-test-results/:id', controller.getAutomationTestResult);

module.exports = router;
