const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/postmanSchedules.controller');

const router = express.Router();
router.use(createAuthenticate(env.jwtSecret));

router.post('/', controller.createPostmanSchedule);
router.get('/', controller.listPostmanSchedules);
router.patch('/:id', controller.updatePostmanSchedule);
router.delete('/:id', controller.deletePostmanSchedule);

module.exports = router;
