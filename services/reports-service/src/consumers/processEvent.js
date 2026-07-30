const ProcessedEvent = require('../models/ProcessedEvent');
const { HANDLERS } = require('./handlers');
const { logger } = require('@qualiguali/shared');

// Every event carries a unique eventId (packages/shared's createDomainEvent).
// Recording it here, keyed as the Mongo _id, makes "has this been processed"
// a single indexed lookup and the record itself a natural duplicate-key
// guard against a race between two concurrent workers.
async function processEvent(event) {
  const { eventId, type, payload } = event;

  const handler = HANDLERS[type];
  if (!handler) {
    logger.info('Ignoring unknown event type', { type, eventId });
    return { skipped: true, reason: 'unknown-type' };
  }

  try {
    await ProcessedEvent.create({ _id: eventId, type });
  } catch (err) {
    if (err.code === 11000) {
      logger.info('Event already processed, skipping', { type, eventId });
      return { skipped: true, reason: 'already-processed' };
    }
    throw err;
  }

  await handler(payload);
  return { skipped: false };
}

module.exports = { processEvent };
