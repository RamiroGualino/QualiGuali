const mongoose = require('mongoose');

const testSuiteSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true },
    // A Test Suite belongs to exactly one Requirement (Requirement 1—N
    // TestSuite); a TestCase belongs to exactly one Suite in turn
    // (TestSuite 1—N TestCase, see TestCase.suiteId) — a case's link to a
    // requirement is transitive through its suite, not stored directly.
    requirementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Requirement',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model('TestSuite', testSuiteSchema, 'qacore_testSuites');
