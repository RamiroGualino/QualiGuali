const mongoose = require('mongoose');

// Copied as-is from QualiGuali_Arquitectura_v1.2.md §9.3.
const AutomationTestResultSchema = new mongoose.Schema({
  automationRunId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AutomationRun',
    required: true,
    index: true,
  },
  suiteName: { type: String, required: true },
  testName: { type: String, required: true },
  status: { type: String, enum: ['passed', 'failed', 'broken', 'skipped'], required: true },
  durationMs: { type: Number, required: true, min: 0 },
  errorMessage: { type: String, default: null },
  stackTraceExcerpt: { type: String, default: null, maxlength: 2000 },
  // Etapa 4 (docs/postman-runner/etapa-4-modelo-de-resultados.md): only
  // ever populated for a live Postman Suite execution (Etapa 3's Runner) —
  // null for Allure and for a manually-uploaded Newman report, since
  // neither carries this level of per-request detail (a manually-uploaded
  // report in particular has no way to recover console.log output after
  // the fact; it was never part of the exported JSON to begin with).
  method: { type: String, default: null },
  url: { type: String, default: null },
  // requestHeaders/requestBody/responseHeaders/responseBody: each either
  // null, { storage: 'inline', value } (small enough to keep in Mongo), or
  // { storage: 's3', url } (over the size threshold — see
  // services/resultStorage.service.js) — Mixed because which shape applies
  // is a per-document, per-field runtime decision, not something a fixed
  // schema can express.
  requestHeaders: { type: mongoose.Schema.Types.Mixed, default: null },
  requestBody: { type: mongoose.Schema.Types.Mixed, default: null },
  responseStatus: { type: Number, default: null },
  responseHeaders: { type: mongoose.Schema.Types.Mixed, default: null },
  responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
  logs: { type: [String], default: [] },
});

AutomationTestResultSchema.index({ automationRunId: 1, status: 1 });

module.exports = mongoose.model(
  'AutomationTestResult',
  AutomationTestResultSchema,
  'execution_automationTestResults',
);
