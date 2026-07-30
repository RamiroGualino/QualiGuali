const mongoose = require('mongoose');

const testPlanSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    testCaseIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TestCase' }],
      default: [],
    },
    status: { type: String, enum: ['draft', 'active', 'closed'], default: 'draft' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model('TestPlan', testPlanSchema, 'qacore_testPlans');
