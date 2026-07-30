// Only the edges explicitly listed in the prompt are valid: any other
// transition — including skipping a step or a same-status no-op — is
// rejected. Reopening funnels back through in_progress, not straight to
// resolved/closed.
const VALID_TRANSITIONS = {
  open: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['in_progress'],
};

function canTransition(fromStatus, toStatus) {
  return Boolean(VALID_TRANSITIONS[fromStatus] && VALID_TRANSITIONS[fromStatus].includes(toStatus));
}

function assertValidTransition(fromStatus, toStatus) {
  if (!canTransition(fromStatus, toStatus)) {
    const err = new Error(`Cannot transition defect from "${fromStatus}" to "${toStatus}"`);
    err.status = 400;
    throw err;
  }
}

module.exports = { VALID_TRANSITIONS, canTransition, assertValidTransition };
