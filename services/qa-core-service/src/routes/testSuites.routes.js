const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/testSuites.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

router.post('/', controller.createTestSuite);
router.get('/', controller.listTestSuites);
router.get('/:id', controller.getTestSuite);
router.patch('/:id', controller.updateTestSuite);
router.delete('/:id', controller.deleteTestSuite);

module.exports = router;
