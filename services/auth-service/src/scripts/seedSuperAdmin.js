const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const User = require('../models/User');
const { hashPassword } = require('../utils/password');
const { ROLES, logger } = require('@qualiguali/shared');

// Bootstraps the very first Super Admin. There is no API endpoint that can
// create one (POST /auth/register only allows a Super Admin to create an
// Admin or a QA Engineer), so this script is the only way in.
async function seedSuperAdmin() {
  const { name, email, password } = env.superAdmin;
  if (!email || !password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set to seed the bootstrap Super Admin',
    );
  }

  await connectDB(env.mongoUri);

  const normalizedEmail = email.toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    logger.info('Super Admin already exists, skipping seed', { email: normalizedEmail });
    await disconnectDB();
    return;
  }

  const passwordHash = await hashPassword(password);
  await User.create({ name, email: normalizedEmail, passwordHash, role: ROLES.SUPER_ADMIN });
  logger.info('Super Admin created', { email: normalizedEmail });

  await disconnectDB();
}

if (require.main === module) {
  seedSuperAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error('Failed to seed Super Admin', { error: err.message });
      process.exit(1);
    });
}

module.exports = seedSuperAdmin;
