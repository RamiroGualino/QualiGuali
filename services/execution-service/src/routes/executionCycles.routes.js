const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/executionCycles.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

router.post('/', controller.createExecutionCycle);
router.get('/', controller.listExecutionCycles);
router.get('/:id', controller.getExecutionCycle);
router.get('/:id/executions', controller.listCycleExecutions);
router.patch('/:id', controller.updateExecutionCycle);
router.delete('/:id', controller.deleteExecutionCycle);
router.post('/:id/close', controller.closeExecutionCycle);
router.post('/:id/duplicate', controller.duplicateExecutionCycle);

module.exports = router;
