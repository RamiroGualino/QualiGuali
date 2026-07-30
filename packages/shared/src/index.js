const { ROLES, ROLE_VALUES } = require('./constants/roles');
const { createDomainEvent } = require('./events/baseEvent');
const { createEventPublisher } = require('./events/publisher');
const logger = require('./utils/logger');
const { nextSequence, nextCode } = require('./utils/counter');
const { createAuthenticate, requireRole } = require('./middleware/auth');
const { notFoundHandler, createErrorHandler } = require('./middleware/errorHandler');
const { createCors } = require('./middleware/cors');

module.exports = {
  ROLES,
  ROLE_VALUES,
  createDomainEvent,
  createEventPublisher,
  logger,
  nextSequence,
  nextCode,
  createAuthenticate,
  requireRole,
  notFoundHandler,
  createErrorHandler,
  createCors,
};
