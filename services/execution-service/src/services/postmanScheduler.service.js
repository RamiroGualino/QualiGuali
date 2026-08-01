const cron = require('node-cron');
const { logger } = require('@qualiguali/shared');
const PostmanSchedule = require('../models/PostmanSchedule');
const PostmanSuite = require('../models/PostmanSuite');
const { runAndPersistPostmanSuite, deriveLastRunStatus } = require('./postmanSuiteRunOrchestrator.service');

// Etapa 6 (docs/postman-runner/etapa-6-programacion-automatica.md): the
// in-process bridge between PostmanSchedule documents and actual node-cron
// tasks. Lives only in this process's memory (`registeredTasks`), same
// reasoning as postmanRunner.service.js's `runningSuiteIds` guard — the MVP
// runs a single execution-service instance (see etapa-1's "Estrategia de
// escalabilidad"), so an in-memory Map is enough; it would need to move to
// something persistent/coordinated the day this service runs as more than
// one instance, since two instances would otherwise both register (and
// both fire) every schedule independently.
const registeredTasks = new Map(); // scheduleId (string) -> node-cron ScheduledTask

// The cron callback itself — re-reads both the schedule and the suite fresh
// on every tick rather than closing over whatever they were when
// registerSchedule() was called, so an edit made through the API (suite
// deactivated, schedule's own isActive flipped) takes effect on the very
// next tick without needing to re-register anything.
async function runScheduledSuite(scheduleId) {
  const schedule = await PostmanSchedule.findById(scheduleId);
  if (!schedule || !schedule.isActive) return;

  const suite = await PostmanSuite.findById(schedule.suiteId);
  if (!suite || !suite.isActive) {
    logger.error('Scheduled Postman suite run skipped: suite missing or inactive', {
      scheduleId: String(scheduleId),
      suiteId: schedule.suiteId ? schedule.suiteId.toString() : null,
    });
    return;
  }

  let result;
  try {
    // Etapa 3's concurrency guard (the in-memory runningSuiteIds Set inside
    // postmanRunner.service.js, keyed by suiteId) is what actually rejects
    // this tick if a manual run of the same Suite is already in flight —
    // runAndPersistPostmanSuite doesn't need its own separate check, it
    // just surfaces whatever runSuite() decides via result.status.
    result = await runAndPersistPostmanSuite(suite, {
      triggerType: 'scheduled',
      triggeredBy: 'scheduler',
    });
  } catch (err) {
    logger.error('Unexpected error running scheduled Postman suite', {
      scheduleId: String(scheduleId),
      suiteId: suite._id.toString(),
      error: err.message,
    });
    return;
  }

  await PostmanSchedule.findByIdAndUpdate(scheduleId, {
    lastRunAt: new Date(),
    lastRunStatus: deriveLastRunStatus(result),
  });
}

// Stops+destroys whatever task is currently registered for this schedule
// (a no-op if none is), so this is always safe to call before registering a
// fresh one — covers both "first registration" and "re-registration after
// an edit" with the same code path.
function unregisterSchedule(scheduleId) {
  const key = String(scheduleId);
  const task = registeredTasks.get(key);
  if (!task) return;
  task.stop();
  Promise.resolve(task.destroy()).catch((err) => {
    logger.error('Failed to destroy a Postman schedule cron task', {
      scheduleId: key,
      error: err.message,
    });
  });
  registeredTasks.delete(key);
}

// Called after every create/update/activate/deactivate of a PostmanSchedule
// — hot-reloads the in-memory cron task without restarting the process (per
// etapa-6's "Bootstrap y recarga" §2). A schedule with isActive: false is
// only ever unregistered, never (re)registered — deactivating one just
// stops its task; the document itself isn't touched.
function registerSchedule(schedule) {
  unregisterSchedule(schedule._id);
  if (!schedule.isActive) return;

  const task = cron.schedule(schedule.cronExpression, () => runScheduledSuite(schedule._id), {
    timezone: schedule.timezone || 'UTC',
  });
  registeredTasks.set(String(schedule._id), task);
}

// Called once at server startup — loads every currently-active schedule and
// registers it, so a process restart doesn't require re-creating schedules
// through the API.
async function bootstrapSchedules() {
  const schedules = await PostmanSchedule.find({ isActive: true });
  schedules.forEach(registerSchedule);
  logger.info(`Postman scheduler bootstrapped ${schedules.length} active schedule(s)`);
}

module.exports = {
  registerSchedule,
  unregisterSchedule,
  bootstrapSchedules,
  runScheduledSuite,
  registeredTasks,
};
