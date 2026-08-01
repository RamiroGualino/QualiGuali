const mongoose = require('mongoose');

// Etapa 7 (docs/postman-runner/etapa-7-sistema-de-alertas.md): an internal
// alert, created by handleAutomationRunIngested when a run has at least one
// failing test. `type` is an enum with a single value today deliberately —
// the doc's own reasoning for this model existing at all is "permite
// agregar otros tipos de alerta a futuro sin nuevo modelo", so the schema
// is shaped for that from the start rather than assuming
// automation-run-failure is the only alert this will ever need to carry.
const notificationSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true },
    type: { type: String, enum: ['automation_run_failed'], required: true, index: true },
    // Already-composed text, not recomputed on read — resolving the
    // Suite/Cycle display name is a live call to execution-service (see
    // notifications.service.js), worth doing once at creation time, not on
    // every GET /notifications.
    title: { type: String, required: true },
    message: { type: String, required: true },
    // String, not ObjectId — same convention as AutomationRunIndex._id and
    // FailedTest.sourceId: an id that crossed from execution-service inside
    // an event payload is treated as an opaque string here, never re-cast
    // to a local ObjectId type.
    relatedAutomationRunId: { type: String, required: true },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ projectId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema, 'reports_notifications');
