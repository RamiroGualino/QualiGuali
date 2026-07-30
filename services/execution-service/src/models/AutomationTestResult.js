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
});

AutomationTestResultSchema.index({ automationRunId: 1, status: 1 });

module.exports = mongoose.model(
  'AutomationTestResult',
  AutomationTestResultSchema,
  'execution_automationTestResults',
);
