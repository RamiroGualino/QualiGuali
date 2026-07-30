const crypto = require('crypto');

/**
 * Base envelope shared by every domain event published async (SNS/SQS) toward
 * reports-service. Individual services own the shape of `payload`; this only
 * standardizes the outer envelope so consumers can route/deduplicate events.
 */
function createDomainEvent({ type, source, payload = {} }) {
  if (!type || !source) {
    throw new Error('createDomainEvent requires "type" and "source"');
  }

  return {
    eventId: crypto.randomUUID(),
    type,
    source,
    occurredAt: new Date().toISOString(),
    payload,
  };
}

module.exports = { createDomainEvent };
