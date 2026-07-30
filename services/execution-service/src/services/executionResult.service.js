const VALID_RESULT_STATUSES = ['pass', 'fail', 'blocked'];

function isValidResultStatus(status) {
  return VALID_RESULT_STATUSES.includes(status);
}

// Registering a result always re-stamps executedAt/executedBy — an
// Execution can be re-run (pass -> fail -> pass, ...), there's no
// restriction based on its current status, only on the target one.
function applyExecutionResult({ status, comments, executedBy }) {
  if (!isValidResultStatus(status)) {
    const err = new Error(
      `Invalid execution status "${status}". Must be one of: ${VALID_RESULT_STATUSES.join(', ')}`,
    );
    err.status = 400;
    throw err;
  }

  return {
    status,
    comments: comments ?? '',
    executedBy: executedBy ?? null,
    executedAt: new Date(),
  };
}

module.exports = { VALID_RESULT_STATUSES, isValidResultStatus, applyExecutionResult };
