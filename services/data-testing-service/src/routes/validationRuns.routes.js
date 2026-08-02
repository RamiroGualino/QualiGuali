const express = require('express');
const multer = require('multer');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/validationRuns.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/', upload.single('file'), controller.createValidationRun);
router.get('/', controller.listValidationRuns);
router.get('/:id', controller.getValidationRun);

module.exports = router;
