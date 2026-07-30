require('dotenv').config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  // Single shared MongoDB instance/database ("qualiguali") per AD-002 — every
  // service points at the same MONGODB_URI and only touches its own
  // prefixed collections (this service owns `auth_users`).
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/qualiguali',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  loginRateLimitWindowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 10,
  // Used to validate assignedProjectIds when creating/editing a user (see
  // src/clients/projectsClient.js) — same synchronous cross-service
  // validation pattern qa-core-service uses for projectId.
  projectsServiceUrl: process.env.PROJECTS_SERVICE_URL || 'http://localhost:4001',
  superAdmin: {
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  },
};

if (!env.jwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

module.exports = env;
