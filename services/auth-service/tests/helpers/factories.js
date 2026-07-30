const User = require('../../src/models/User');
const { hashPassword } = require('../../src/utils/password');
const { signAuthToken } = require('../../src/utils/jwt');
const { ROLES } = require('@qualiguali/shared');

async function createUser({
  name = 'Test User',
  email,
  password = 'Password123!',
  role = ROLES.QA_ENGINEER,
  isActive = true,
  assignedProjectIds = [],
}) {
  const passwordHash = await hashPassword(password);
  return User.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
    isActive,
    assignedProjectIds,
  });
}

function tokenFor(user) {
  return signAuthToken({ userId: user._id.toString(), role: user.role });
}

module.exports = { createUser, tokenFor };
