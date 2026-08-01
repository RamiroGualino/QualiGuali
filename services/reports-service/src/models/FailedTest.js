const mongoose = require('mongoose');

// Not part of the ERD given in the architecture doc (which only defines the
// two aggregate collections) — added to serve GET /reports/cycles/:id/failures
// with real per-test drill-down data, since neither CYCLE_REPORT nor any
// published event carries individual failing tests. See README.
const linkedDefectSchema = new mongoose.Schema(
  { defectId: String, code: String, status: String },
  { _id: false },
);

const failedTestSchema = new mongoose.Schema(
  {
    // Etapa 5 (docs/postman-runner/etapa-5-sistema-de-reportes.md): exactly
    // one of cycleId/postmanSuiteId is set, never both — a manual/Allure/
    // uploaded-Newman failure is attributed to the cycle it ran in, while a
    // live Postman Suite execution normally has no cycleId at all and is
    // attributed to its Suite instead. Neither is `required` at the schema
    // level since which one applies is a per-document decision the handler
    // makes, not something a fixed schema can enforce.
    cycleId: { type: String, default: null, index: true },
    postmanSuiteId: { type: String, default: null, index: true },
    projectId: { type: String, required: true, index: true },
    origin: { type: String, enum: ['manual', 'allure', 'newman'], required: true },
    // executionId (manual) or automationTestResultId (allure/newman) — the
    // one thing that uniquely identifies this failure and lets us upsert it
    // idempotently as events are (re)processed.
    sourceId: { type: String, required: true },
    testName: { type: String, required: true },
    suiteName: { type: String, default: null },
    // Left null for manual results: Execution doesn't carry moduleId and
    // resolving it would need yet another cross-service call — flagged as a
    // known gap in the README rather than silently added.
    moduleId: { type: String, default: null },
    status: { type: String, required: true },
    errorMessage: { type: String, default: null },
    comments: { type: String, default: null },
    rawReportUrl: { type: String, default: null },
    linkedDefect: { type: linkedDefectSchema, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

failedTestSchema.index({ origin: 1, sourceId: 1 }, { unique: true });

module.exports = mongoose.model('FailedTest', failedTestSchema, 'reports_failedTests');
