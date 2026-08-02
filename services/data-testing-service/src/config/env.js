require('dotenv').config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4006,
  // Single shared MongoDB instance/database ("qualiguali") per AD-002 — same
  // as the other 6 services. This service only reads/writes its own
  // collections: data_testing_expectationSuites, data_testing_validationRuns.
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/qualiguali',
  // Same secret as the other services — JWT is verified locally/stateless.
  jwtSecret: process.env.JWT_SECRET,
  // Base URL of projects-service, used to synchronously validate projectId
  // before creating an ExpectationSuite (Etapa 4) — not used yet in Etapa 1.
  projectsServiceUrl: process.env.PROJECTS_SERVICE_URL || 'http://localhost:4001',
};

if (!env.jwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

module.exports = env;
