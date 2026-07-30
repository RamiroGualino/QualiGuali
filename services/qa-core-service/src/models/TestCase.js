const mongoose = require('mongoose');

const stepSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    action: { type: String, required: true },
    // No longer collected as its own form field — steps are now a single
    // numbered free-text field (one action per line). Kept on the schema
    // (not required) so older test cases created before this change keep
    // whatever per-step expected result they already have.
    expectedResult: { type: String, default: '' },
  },
  { _id: false },
);

const testCaseSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, index: true },
    moduleId: { type: String, default: null },
    // A case belongs to exactly one Suite (TestSuite 1—N TestCase); its
    // requirement is reached transitively via suiteId -> TestSuite.requirementId.
    suiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestSuite',
      required: true,
      index: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TestCaseTemplate',
      required: true,
    },
    code: { type: String, required: true },
    // A separate identifier from an external source (Kualitee export,
    // whatever spreadsheet the team already tracks cases in) — imported
    // test cases usually already carry one. Distinct from `code`, which
    // this app always assigns itself for internal uniqueness/routing;
    // `testCaseId` is just carried along and displayed since it's the
    // identifier testers actually recognize from the original source.
    testCaseId: { type: String, default: '' },
    title: { type: String, required: true, trim: true },
    // Short one-line summary shown alongside the title — distinct from the
    // free-form preconditions/steps text below it.
    summary: { type: String, default: '' },
    preconditions: { type: String, default: '' },
    steps: { type: [stepSchema], default: [] },
    // Case-level expected result, separate from each step's own
    // expectedResult (Kualitee-style "Información General").
    expectedResult: { type: String, default: '' },
    // What actually happened the last time someone documented it here —
    // free-text, not tied to any specific ExecutionHistory row. Separate
    // from a per-cycle-run's own result (execution-service's Execution/
    // ExecutionHistory), which stays the source of truth for pass/fail
    // history; this is just a "test case format" column like the rest.
    actualResult: { type: String, default: '' },
    postconditions: { type: String, default: '' },
    comments: { type: String, default: '' },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Same scale as Requirement.priority, for consistency across the domain.
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['draft', 'active', 'deprecated'], default: 'draft' },
    build: { type: String, default: '' },
    // Purely descriptive grouping label (no new Scenario entity/hierarchy) —
    // matches Kualitee's "Test Scenario" naming without changing the
    // existing Requirement -> Suite -> TestCase relationship.
    scenarioName: { type: String, default: '' },
    scenarioSummary: { type: String, default: '' },
    executionType: { type: String, enum: ['manual', 'automated'], default: 'manual' },
    testingType: {
      type: String,
      enum: [
        'functional',
        'regression',
        'smoke',
        'integration',
        'uat',
        'performance',
        'security',
        'other',
      ],
      default: 'functional',
    },
    estimatedTime: { type: Number, default: null },
    // Free-text, same pattern as Defect.assignedTo/ExecutionCycle.assignee —
    // no auth-service dependency.
    assignee: { type: String, default: null },
    // Independent from each other: a case can be automated at one layer,
    // both, or neither, regardless of executionType (which just says
    // whether it's *run* manually or by automation today).
    automationUi: { type: Boolean, default: false },
    automationApi: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

testCaseSchema.index({ projectId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('TestCase', testCaseSchema, 'qacore_testCases');
