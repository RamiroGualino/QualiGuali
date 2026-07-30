const mongoose = require('mongoose');

const executionCycleSchema = new mongoose.Schema(
  {
    // String, not ObjectId refs: projectId/testPlanId/requirementIds point at
    // other services' own databases (projects-service / qa-core-service).
    projectId: { type: String, required: true, index: true },
    testPlanId: { type: String, default: null },
    // Alternative (and combinable) way to seed a cycle: pick Requirements
    // directly instead of a curated Test Plan — pulls in every test case
    // under each requirement's suites (see qaCoreClient.resolveTestCaseIdsFromRequirements).
    requirementIds: { type: [String], default: [] },
    // Points at a TestSuite in qa-core-service's own database (same
    // cross-service string-ref pattern as testPlanId/requirementIds): the
    // source suite a cycle's test cases were curated from.
    suiteId: { type: String, default: null },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    assignee: { type: String, default: null },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['planned', 'in_progress', 'closed'], default: 'planned' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model(
  'ExecutionCycle',
  executionCycleSchema,
  'execution_executionCycles',
);
