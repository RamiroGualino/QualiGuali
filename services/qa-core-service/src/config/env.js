require('dotenv').config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4002,
  // Single shared MongoDB instance/database ("qualiguali") per AD-002 — this
  // service only reads/writes its own collections: qacore_requirements,
  // qacore_testCaseTemplates, qacore_testCases, qacore_testPlans, qacore_counters.
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/qualiguali',
  // Same secret as auth-service — JWT is verified locally/stateless here too.
  jwtSecret: process.env.JWT_SECRET,
  // Base URL used to synchronously validate projectId/moduleId against
  // projects-service before creating Requirements/TestCases/TestPlans.
  projectsServiceUrl: process.env.PROJECTS_SERVICE_URL || 'http://localhost:4001',
};

if (!env.jwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

module.exports = env;
