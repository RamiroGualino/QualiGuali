const mongoose = require('mongoose');

// Internal-only lookup, not part of the public read-model: maps a manual
// Execution to the cycle/project it belongs to and its last-known status.
// Needed because (a) ExecutionUpdated doesn't carry projectId, and (b) a
// defect linked via linkedExecutionId needs to be traced back to a cycle,
// and no event carries that mapping directly — see README for both gaps.
const executionIndexSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // executionId
  cycleId: { type: String, required: true, index: true },
  projectId: { type: String, required: true },
  status: { type: String, required: true },
});

module.exports = mongoose.model('ExecutionIndex', executionIndexSchema, 'reports_executionIndex');
