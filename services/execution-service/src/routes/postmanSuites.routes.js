const express = require('express');
const multer = require('multer');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/postmanSuites.controller');
const runnerController = require('../controllers/postmanRunner.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.postmanUploadMaxBytes },
});
// Two distinct named fields (not an array, unlike automation-runs' `files`)
// — a collection and an environment are different things, never
// interchangeable, so the client always says exactly which is which.
const uploadFields = upload.fields([
  { name: 'collection', maxCount: 1 },
  { name: 'environment', maxCount: 1 },
]);

router.post('/', uploadFields, controller.createPostmanSuite);
router.get('/', controller.listPostmanSuites);
router.get('/:id', controller.getPostmanSuite);
router.patch('/:id', controller.updatePostmanSuite);
router.post('/:id/versions', uploadFields, controller.addPostmanSuiteVersion);
router.get('/:id/versions', controller.listPostmanSuiteVersions);
router.delete('/:id', controller.deletePostmanSuite);
router.post('/:id/run', runnerController.triggerPostmanSuiteRun);
router.get('/:id/compare', controller.compareSuiteRuns);

module.exports = router;
