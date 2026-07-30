const jwt = require('jsonwebtoken');
const { ROLES } = require('@qualiguali/shared');
const env = require('../config/env');

// Async event processing has no end-user request to forward a JWT from (the
// caller/producer of the SNS message is another service, not a browser
// session) — so reports-service mints its own short-lived internal token,
// signed with the same shared JWT_SECRET every service already trusts.
function issueServiceToken() {
  return jwt.sign({ userId: 'system:reports-service', role: ROLES.SUPER_ADMIN }, env.jwtSecret, {
    expiresIn: '5m',
  });
}

module.exports = { issueServiceToken };
