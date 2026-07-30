const mongoose = require('mongoose');

const requirementSchema = new mongoose.Schema(
  {
    // projectId/moduleId are String, not ObjectId refs: they point at
    // projects-service's own database, which this service never joins
    // against directly (cross-service validation happens via REST).
    projectId: { type: String, required: true, index: true },
    moduleId: { type: String, default: null },
    code: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    // Testing-lifecycle status, not a definition/approval status: where the
    // requirement stands in QA coverage, not whether its text is finalized.
    status: {
      type: String,
      enum: ['pending', 'in_test', 'finished', 'cancelled'],
      default: 'pending',
    },
    // Link to the corresponding Jira ticket — plain string, not validated
    // against a URL format, since teams sometimes paste a ticket key or an
    // internal shortlink instead of a full https:// URL.
    jiraUrl: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

requirementSchema.index({ projectId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Requirement', requirementSchema, 'qacore_requirements');
