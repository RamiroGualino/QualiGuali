const mongoose = require('mongoose');

// Etapa 6 (docs/postman-runner/etapa-6-programacion-automatica.md): a cron
// schedule for a PostmanSuite — one document per registered node-cron task
// (see services/postmanScheduler.service.js, which is the in-memory bridge
// between this collection and actual scheduled ticks).
const postmanScheduleSchema = new mongoose.Schema(
  {
    suiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PostmanSuite',
      required: true,
      index: true,
    },
    // Denormalized from the Suite at creation time (same convention as
    // AutomationRun.projectId) so GET /postman-schedules?projectId= doesn't
    // need a join against PostmanSuite for every row.
    projectId: { type: String, required: true, index: true },
    // Validated with node-cron's own validate() — see
    // services/cronSchedule.service.js — before this ever reaches the
    // database, so an invalid expression never gets this far.
    cronExpression: { type: String, required: true },
    timezone: { type: String, default: 'UTC' },
    isActive: { type: Boolean, default: true, index: true },
    // Denormalized from the most recent scheduled run so the schedules
    // admin UI can show "last run" without a second query against
    // AutomationRun for every schedule row.
    lastRunAt: { type: Date, default: null },
    lastRunStatus: { type: String, default: null },
    createdBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

postmanScheduleSchema.index({ suiteId: 1, isActive: 1 });

module.exports = mongoose.model(
  'PostmanSchedule',
  postmanScheduleSchema,
  'execution_postmanSchedules',
);
