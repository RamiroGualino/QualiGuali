require('dotenv').config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4005,
  // Single shared MongoDB instance/database ("qualiguali") per AD-002 — this
  // service only reads/writes its own collections: reports_cycleReports,
  // reports_trendPoints, and a few internal-only ones (see README).
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/qualiguali',
  // Same secret as the other services — used both to verify incoming JWTs on
  // this service's own read endpoints, and to mint short-lived internal
  // service tokens when calling other services from the async consumer
  // (there's no end-user request to forward a token from there).
  jwtSecret: process.env.JWT_SECRET,
  executionServiceUrl: process.env.EXECUTION_SERVICE_URL || 'http://localhost:4003',
  qaCoreServiceUrl: process.env.QA_CORE_SERVICE_URL || 'http://localhost:4002',
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    endpointUrl: process.env.AWS_ENDPOINT_URL || null,
    queueUrl: process.env.SQS_QUEUE_URL || null,
  },
};

if (!env.jwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

module.exports = env;
