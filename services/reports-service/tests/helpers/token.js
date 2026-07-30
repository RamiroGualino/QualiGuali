const jwt = require('jsonwebtoken');

function tokenFor({ userId = 'user-1', role }) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function domainEvent(type, payload) {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    type,
    source: 'test',
    occurredAt: new Date().toISOString(),
    payload,
  };
}

module.exports = { tokenFor, domainEvent };
