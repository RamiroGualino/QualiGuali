const express = require('express');
const multer = require('multer');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/suites.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

// Memoria, no disco — mismo criterio que execution-service/defects-service:
// un archivo de referencia (.xlsx/.csv/.ods) nunca es tan grande como para
// justificar streaming a disco.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/', controller.createExpectationSuite);
router.get('/', controller.listExpectationSuites);
router.post('/detect-columns', upload.single('file'), controller.detectColumns);
router.get('/:id', controller.getExpectationSuite);
router.patch('/:id', controller.updateExpectationSuite);
router.delete('/:id', controller.deleteExpectationSuite);
router.post('/:id/preview-match', upload.single('file'), controller.previewMatch);

module.exports = router;
