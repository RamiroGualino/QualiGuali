require('dotenv').config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4004,
  // Single shared MongoDB instance/database ("qualiguali") per AD-002 — this
  // service only reads/writes its own collections: defects_defects,
  // defects_defectComments, defects_counters, defects_evidence.
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/qualiguali',
  // Same secret as the other services — JWT is verified locally/stateless.
  jwtSecret: process.env.JWT_SECRET,
  // Base URL of projects-service, used to synchronously validate projectId
  // before creating a Defect.
  projectsServiceUrl: process.env.PROJECTS_SERVICE_URL || 'http://localhost:4001',
  // Base URL of execution-service, used to synchronously validate
  // linkedExecutionId / linkedAutomationTestResultId when provided.
  executionServiceUrl: process.env.EXECUTION_SERVICE_URL || 'http://localhost:4003',
  // Same bucket execution-service uses for execution evidence — defect
  // evidence lives in its own collection/key prefix but shares the
  // MinIO/S3 backend, so no separate bucket setup is needed.
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'qualiguali-evidence',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    publicUrlBase: process.env.S3_PUBLIC_URL_BASE || null,
  },
};

if (!env.jwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

module.exports = env;
