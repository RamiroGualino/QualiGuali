const { nextCode: sharedNextCode } = require('@qualiguali/shared');
const Counter = require('../models/Counter');

// defects-service only ever mints one kind of code (DEF-XXX), so the prefix
// is baked in here rather than exposed as a parameter.
function nextCode(projectId) {
  return sharedNextCode(Counter, projectId, 'DEF');
}

module.exports = { nextCode };
