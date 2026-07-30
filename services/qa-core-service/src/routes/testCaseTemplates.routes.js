const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/testCaseTemplates.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

router.post('/', controller.createTemplate);
router.get('/', controller.listTemplates);
router.get('/:id', controller.getTemplate);
router.patch('/:id', controller.updateTemplate);
router.delete('/:id', controller.deleteTemplate);

module.exports = router;
