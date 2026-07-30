const jwt = require('jsonwebtoken');
const env = require('../config/env');

function signAuthToken({ userId, role }) {
  return jwt.sign({ userId, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function verifyAuthToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = { signAuthToken, verifyAuthToken };
