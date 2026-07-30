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
