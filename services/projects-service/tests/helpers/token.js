const jwt = require('jsonwebtoken');

// projects-service doesn't own User records — tests sign a JWT directly with
// the same shared secret, just like a real auth-service-issued token would.
function tokenFor({ userId = 'user-1', role }) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { tokenFor };
