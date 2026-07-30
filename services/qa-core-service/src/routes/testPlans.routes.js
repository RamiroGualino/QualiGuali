const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/testPlans.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

router.post('/', controller.createTestPlan);
router.get('/', controller.listTestPlans);
router.get('/:id', controller.getTestPlan);
router.patch('/:id', controller.updateTestPlan);
router.delete('/:id', controller.deleteTestPlan);
router.post('/:id/test-cases', controller.addTestCases);

module.exports = router;
