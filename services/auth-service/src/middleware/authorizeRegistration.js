const { canRegister, REGISTERABLE_ROLES } = require('../utils/permissions');

function authorizeRegistration(req, res, next) {
  const actorRole = req.auth?.role;
  const targetRole = req.body?.role;

  if (!canRegister(actorRole, targetRole)) {
    return res.status(403).json({
      message: `Role "${actorRole}" cannot create a user with role "${targetRole}". Allowed target roles: ${REGISTERABLE_ROLES.join(', ')}`,
    });
  }

  return next();
}

module.exports = authorizeRegistration;
