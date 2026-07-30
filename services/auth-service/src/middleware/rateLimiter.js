const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Basic brute-force mitigation on login, keyed by IP.
const loginRateLimiter = rateLimit({
  windowMs: env.loginRateLimitWindowMs,
  max: env.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts, please try again later.' },
});

module.exports = loginRateLimiter;
