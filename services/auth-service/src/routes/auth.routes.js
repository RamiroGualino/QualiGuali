const express = require('express');
const { createAuthenticate } = require('@qualiguali/shared');
const env = require('../config/env');
const authorizeRegistration = require('../middleware/authorizeRegistration');
const loginRateLimiter = require('../middleware/rateLimiter');
const controller = require('../controllers/auth.controller');

const router = express.Router();
const authenticate = createAuthenticate(env.jwtSecret);

router.post('/login', loginRateLimiter, controller.login);
router.post('/register', authenticate, authorizeRegistration, controller.register);
router.get('/me', authenticate, controller.me);
router.post('/refresh', controller.refresh); // TODO: see controller.refresh

module.exports = router;
