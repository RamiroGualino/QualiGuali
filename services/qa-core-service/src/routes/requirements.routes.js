const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/requirements.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

router.post('/', controller.createRequirement);
router.get('/', controller.listRequirements);
router.get('/:id', controller.getRequirement);
router.get('/:id/test-cases', controller.listRequirementTestCases);
router.patch('/:id', controller.updateRequirement);
router.delete('/:id', controller.deleteRequirement);

module.exports = router;
