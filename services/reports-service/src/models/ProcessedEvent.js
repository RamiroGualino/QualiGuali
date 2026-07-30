const mongoose = require('mongoose');

// Idempotency ledger: every event's eventId is recorded once handled, so
// reprocessing the same SQS message (at-least-once delivery, or a manual
// replay) never double-applies its effects.
const processedEventSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // eventId
  type: { type: String, required: true },
  processedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('ProcessedEvent', processedEventSchema, 'reports_processedEvents');
