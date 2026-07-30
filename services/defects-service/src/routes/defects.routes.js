const express = require('express');
const multer = require('multer');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/defects.controller');
const commentsController = require('../controllers/comments.controller');
const evidenceController = require('../controllers/evidence.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/', controller.createDefect);
router.get('/', controller.listDefects);
router.get('/:id', controller.getDefect);
router.patch('/:id', controller.updateDefect);
router.delete('/:id', controller.deleteDefect);
router.patch('/:id/status', controller.updateDefectStatus);
router.post('/:id/comments', commentsController.createComment);
router.get('/:id/comments', commentsController.listComments);
router.post('/:id/evidence', upload.single('file'), evidenceController.uploadEvidence);
router.get('/:id/evidence', evidenceController.listEvidence);

module.exports = router;
