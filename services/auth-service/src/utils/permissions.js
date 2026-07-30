const { ROLES } = require('@qualiguali/shared');

// Only a Super Admin can register new users, and only into these two roles —
// there is no endpoint that creates another Super Admin (see seed script).
const REGISTERABLE_ROLES = [ROLES.ADMIN, ROLES.QA_ENGINEER];

function canRegister(actorRole, targetRole) {
  return actorRole === ROLES.SUPER_ADMIN && REGISTERABLE_ROLES.includes(targetRole);
}

module.exports = { canRegister, REGISTERABLE_ROLES };
