const {
  nextSequence: sharedNextSequence,
  nextCode: sharedNextCode,
} = require('@qualiguali/shared');
const Counter = require('../models/Counter');

// Thin wrapper over the shared atomic-counter helper (extracted to
// packages/shared in Parte 5, once defects-service needed the same
// mechanism for DEF-XXX codes) — keeps this service's own public API
// (projectId, prefix) unchanged for its existing callers/tests.
function nextSequence(projectId, prefix) {
  return sharedNextSequence(Counter, projectId, prefix);
}

function nextCode(projectId, prefix) {
  return sharedNextCode(Counter, projectId, prefix);
}

module.exports = { nextSequence, nextCode };
