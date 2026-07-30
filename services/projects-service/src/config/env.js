require('dotenv').config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4001,
  // Single shared MongoDB instance/database ("qualiguali") per AD-002 — this
  // service only reads/writes its own collections: projects_projects and
  // projects_functionalModules.
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/qualiguali',
  // Same secret as auth-service — JWT is verified locally/stateless here too.
  jwtSecret: process.env.JWT_SECRET,
};

if (!env.jwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

module.exports = env;
