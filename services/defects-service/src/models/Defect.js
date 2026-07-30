const mongoose = require('mongoose');

const defectSchema = new mongoose.Schema(
  {
    // String, not ObjectId refs: projectId/linkedExecutionId/... point at
    // other services' own databases (projects-service / execution-service).
    projectId: { type: String, required: true, index: true },
    code: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // What actually happened when the case was run — distinct from
    // `description` (which is the free-form bug write-up). Mainly populated
    // when a defect is reported straight from a failed execution, seeded
    // from the tester's result comments.
    actualResult: { type: String, default: '' },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed', 'reopened'],
      default: 'open',
    },
    reportedBy: { type: String, required: true },
    assignedTo: { type: String, default: null },
    linkedExecutionId: { type: String, default: null },
    linkedAutomationTestResultId: { type: String, default: null },
    // Link to the corresponding Jira ticket — plain string, not validated
    // against a URL format, since teams sometimes paste a ticket key or an
    // internal shortlink instead of a full https:// URL.
    jiraUrl: { type: String, default: null },
  },
  // Unlike the other entities so far, the ERD for DEFECT explicitly lists
  // both createdAt *and* updatedAt.
  { timestamps: true },
);

defectSchema.index({ projectId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Defect', defectSchema, 'defects_defects');
