const jwt = require('jsonwebtoken');

function tokenFor({ userId = 'user-1', role }) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { tokenFor };
