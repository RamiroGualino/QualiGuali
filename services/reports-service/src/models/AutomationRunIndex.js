const mongoose = require('mongoose');

// Internal-only lookup: maps an AutomationRun to its cycle/project. Needed
// to trace a defect linked via linkedAutomationTestResultId back to a cycle
// (AutomationRunIngested carries cycleId at the run level; a specific test
// result's run is resolved live from execution-service, see README).
const automationRunIndexSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // automationRunId
  cycleId: { type: String, default: null },
  projectId: { type: String, required: true },
});

module.exports = mongoose.model(
  'AutomationRunIndex',
  automationRunIndexSchema,
  'reports_automationRunIndex',
);
