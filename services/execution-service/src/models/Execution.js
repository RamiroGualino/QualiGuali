const mongoose = require('mongoose');

const executionSchema = new mongoose.Schema(
  {
    cycleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExecutionCycle',
      required: true,
      index: true,
    },
    testCaseId: { type: String, required: true },
    executedBy: { type: String, default: null },
    status: {
      type: String,
      enum: ['pass', 'fail', 'blocked', 'not_executed'],
      default: 'not_executed',
    },
    comments: { type: String, default: '' },
    executedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model('Execution', executionSchema, 'execution_executions');
