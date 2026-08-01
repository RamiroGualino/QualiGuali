const mongoose = require('mongoose');

// Copied as-is from QualiGuali_Arquitectura_v1.2.md §9.3 (single shared
// database, no per-service DB / no tenant).
const AutomationRunSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true },
    cycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExecutionCycle',
      default: null,
      index: true,
    },
    tool: { type: String, enum: ['allure', 'newman'], required: true, index: true },
    triggeredBy: { type: String, required: true },
    rawReportUrl: { type: String, required: true },
    // Etapa 4 (docs/postman-runner/etapa-4-modelo-de-resultados.md): null
    // for Allure runs and manually-uploaded Newman reports — set when the
    // Runner (Etapa 3) executed a PostmanSuite live.
    postmanSuiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PostmanSuite',
      default: null,
      index: true,
    },
    // Distinguishes a human-triggered run from a cron-triggered one (Etapa
    // 6) or a retry of a previously failed run — always 'manual' for a
    // manually-uploaded report, since there's no other way one gets in.
    triggerType: {
      type: String,
      enum: ['manual', 'scheduled', 'retry'],
      default: 'manual',
    },
    // Etapa 6 (docs/postman-runner/etapa-6-programacion-automatica.md): the
    // PostmanSuite's collectionVersion/environmentVersion *at the moment
    // this run executed* — null for Allure/manually-uploaded-Newman, same
    // as postmanSuiteId. Captured because the Suite's current files can
    // change after this run (a later version upload), but POST
    // /execution/automation-runs/:id/retry needs to re-run with the exact
    // files this run actually used, not whatever the Suite points to now —
    // resolved back to a file URL via PostmanSuiteVersion at retry time.
    collectionVersion: { type: Number, default: null },
    environmentVersion: { type: Number, default: null },
    totalTests: { type: Number, required: true, min: 0 },
    passed: { type: Number, required: true, min: 0 },
    failed: { type: Number, required: true, min: 0 },
    broken: { type: Number, default: 0, min: 0 },
    skipped: { type: Number, default: 0, min: 0 },
    durationMs: { type: Number, required: true, min: 0 },
    executedAt: { type: Date, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

AutomationRunSchema.index({ projectId: 1, tool: 1, executedAt: -1 });

module.exports = mongoose.model('AutomationRun', AutomationRunSchema, 'execution_automationRuns');
