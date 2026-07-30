const mongoose = require('mongoose');

// Append-only log of every result ever registered for an Execution — the
// Execution document itself only ever holds the *current* status/comments
// (everything else in this service reads that as "the" result: KPI counts,
// the results bar, close-cycle validation, the ExecutionUpdated event), so
// re-executing a case doesn't lose the earlier attempts.
const executionHistorySchema = new mongoose.Schema(
  {
    executionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Execution',
      required: true,
      index: true,
    },
    status: { type: String, enum: ['pass', 'fail', 'blocked'], required: true },
    comments: { type: String, default: '' },
    executedBy: { type: String, default: null },
    executedAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model(
  'ExecutionHistory',
  executionHistorySchema,
  'execution_executionHistory',
);
