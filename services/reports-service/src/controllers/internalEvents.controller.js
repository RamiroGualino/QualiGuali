const { processEvent } = require('../consumers/processEvent');
const { logger } = require('@qualiguali/shared');

// Synchronous, dependency-free stand-in for the SNS->SQS fan-out (see
// @qualiguali/shared's createEventPublisher "local HTTP delivery" mode):
// when no publisher has SNS configured, it POSTs the event straight here
// instead. Reuses the exact same processEvent the SQS consumer calls —
// same idempotency guard (ProcessedEvent), same handlers, same behavior —
// this is just a different transport for the same event.
async function receiveEvent(req, res, next) {
  try {
    const event = req.body;
    if (!event || !event.eventId || !event.type) {
      return res.status(400).json({ message: 'A domain event envelope is required' });
    }

    const result = await processEvent(event);
    return res.status(200).json(result);
  } catch (err) {
    logger.error('Failed to process locally-delivered domain event', {
      eventId: req.body?.eventId,
      type: req.body?.type,
      error: err.message,
    });
    return next(err);
  }
}

module.exports = { receiveEvent };
