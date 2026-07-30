const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/testCases.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

router.post('/', controller.createTestCase);
router.get('/', controller.listTestCases);
router.get('/:id', controller.getTestCase);
router.patch('/:id', controller.updateTestCase);
router.delete('/:id', controller.deleteTestCase);

module.exports = router;
