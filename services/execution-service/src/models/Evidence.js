const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  executionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Execution',
    required: true,
    index: true,
  },
  // Which specific execution attempt this evidence belongs to. Starts null
  // at upload time (evidence is normally attached before a result is
  // submitted) and gets claimed by the ExecutionHistory row created for the
  // next result the tester submits — see updateExecutionResult.
  executionHistoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExecutionHistory',
    default: null,
  },
  fileUrl: { type: String, required: true },
  fileType: { type: String, enum: ['image', 'video', 'log'], required: true },
  uploadedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Evidence', evidenceSchema, 'execution_evidence');
