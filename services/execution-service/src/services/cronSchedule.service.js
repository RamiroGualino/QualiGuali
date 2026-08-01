const cron = require('node-cron');

// Etapa 6 (docs/postman-runner/etapa-6-programacion-automatica.md): thin
// wrapper around node-cron's own parsing/validation — the doc calls for
// validating with "la misma librería de parseo de cron usada por
// node-cron", and node-cron v4 (zero dependencies) does that parsing
// itself, so this module just exposes it rather than pulling in a second
// cron-parsing library for the same job.
function isValidCronExpression(expression) {
  return cron.validate(expression);
}

// node-cron doesn't expose a schedule-less "what would the next run be"
// function — the only way to reach its date-computation logic is a real
// task, and (verified empirically — not documented) getNextRun() only
// returns a Date once the task has actually been started; a freshly
// created-but-never-started task always reports null. createTask() throws
// synchronously on an invalid expression, so isValidCronExpression() is
// checked first rather than relying on a try/catch here. The task is
// stopped+destroyed immediately after reading its next run — started just
// long enough to ask it one question, never left running, and no callback
// can fire in between since the soonest any cron tick occurs is seconds
// away at minimum.
async function getNextRunAt(expression, timezone = 'UTC') {
  if (!isValidCronExpression(expression)) return null;
  const task = cron.createTask(expression, () => {}, { timezone });
  try {
    task.start();
    return task.getNextRun();
  } finally {
    task.stop();
    await task.destroy();
  }
}

module.exports = { isValidCronExpression, getNextRunAt };
