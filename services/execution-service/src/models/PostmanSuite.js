const mongoose = require('mongoose');

// Etapa 2 (docs/postman-runner/etapa-2-gestion-de-suites.md): a Postman
// collection + optional environment, versioned, associated to a Project and
// (same as qa-core-service's TestSuite) always to a Requirement — every
// Postman suite is traceable to the functional requirement it covers, for
// filtering/reporting purposes.
const postmanSuiteSchema = new mongoose.Schema(
  {
    // Logical reference to projects-service, validated via HTTP on create
    // (same convention as AutomationRun.projectId) — no local FK.
    projectId: { type: String, required: true, index: true },
    // Logical reference to qa-core-service's Requirement — deliberately no
    // `ref` (that model isn't registered in this service, so populate()
    // wouldn't work), but required, same convention as
    // qa-core-service's TestSuite.requirementId — only its *existence* in
    // the remote service isn't validated here (execution-service has no
    // client for qa-core-service the way it does for projects-service).
    requirementId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    // Always mirrors whichever version's file is currently "active" —
    // collectionVersion/environmentVersion can drift independently, since a
    // new version upload doesn't have to replace the environment every time
    // (see addPostmanSuiteVersion in the controller).
    collectionFileUrl: { type: String, required: true },
    collectionVersion: { type: Number, required: true, default: 1, min: 1 },
    environmentFileUrl: { type: String, default: null },
    environmentVersion: { type: Number, default: null },
    // Used by the Runner (Etapa 3) to abort a hung execution. 30s default —
    // generous for a typical smoke/regression collection without letting a
    // stuck run block a suite indefinitely.
    timeoutMs: { type: Number, required: true, default: 30000, min: 1000 },
    // Soft-disable — keeps historical AutomationRuns/versions intact.
    isActive: { type: Boolean, default: true, index: true },
    // Denormalized from this Suite's most recent run attempt (any trigger:
    // manual, scheduled, retry — see runAndPersistPostmanSuite), same
    // convention as PostmanSchedule.lastRunAt/lastRunStatus. 'completed'
    // means the run finished and produced a pass/fail tally; anything else
    // (e.g. 'timeout', 'download_error', 'execution_error',
    // 'already_running') means the Suite itself failed to execute —
    // distinct from a completed run whose individual tests failed, which
    // only shows up in that run's own AutomationTestResult rows, not here.
    lastRunAt: { type: Date, default: null },
    lastRunStatus: { type: String, default: null },
    createdBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

postmanSuiteSchema.index({ projectId: 1, isActive: 1 });

module.exports = mongoose.model('PostmanSuite', postmanSuiteSchema, 'execution_postmanSuites');
