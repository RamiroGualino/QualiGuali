const express = require('express');
const multer = require('multer');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/executions.controller');
const evidenceController = require('../controllers/evidence.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.get('/', controller.listExecutions);
router.get('/:id', controller.getExecution);
router.patch('/:id', controller.updateExecutionResult);
router.get('/:id/history', controller.listExecutionHistory);
router.delete('/:id/history/:historyId', controller.deleteExecutionHistoryEntry);
router.post('/:id/evidence', upload.single('file'), evidenceController.uploadEvidence);
router.get('/:id/evidence', evidenceController.listEvidence);
router.patch('/:id/evidence/:evidenceId', upload.single('file'), evidenceController.updateEvidence);
router.delete('/:id/evidence/:evidenceId', evidenceController.deleteEvidence);

module.exports = router;
