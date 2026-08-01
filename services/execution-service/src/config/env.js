require('dotenv').config({ quiet: true });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4003,
  // Single shared MongoDB instance/database ("qualiguali") per AD-002 — this
  // service only reads/writes its own collections: execution_executionCycles,
  // execution_executions, execution_evidence.
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/qualiguali',
  // Same secret as the other services — JWT is verified locally/stateless.
  jwtSecret: process.env.JWT_SECRET,
  // Base URL of qa-core-service, used to synchronously validate testCaseId/
  // testPlanId before creating Executions.
  qaCoreServiceUrl: process.env.QA_CORE_SERVICE_URL || 'http://localhost:4002',
  // Base URL of projects-service, used to synchronously validate projectId
  // before creating an AutomationRun (Arquitectura v1.2 §9.2: "se valida vía
  // API síncrona al crear").
  projectsServiceUrl: process.env.PROJECTS_SERVICE_URL || 'http://localhost:4001',
  // Max size per uploaded automation report file (Arquitectura v1.1 §8.4
  // [DECISIÓN PENDIENTE]: 50MB default, configurable).
  automationUploadMaxBytes: Number(process.env.AUTOMATION_UPLOAD_MAX_BYTES) || 50 * 1024 * 1024,
  // Postman collections/environments are plain JSON, not binary automation
  // reports — 5MB comfortably covers even a large real-world collection
  // (Etapa 2 [DECISIÓN PENDIENTE] resolved: docs/postman-runner/etapa-2-gestion-de-suites.md).
  postmanUploadMaxBytes: Number(process.env.POSTMAN_UPLOAD_MAX_BYTES) || 5 * 1024 * 1024,
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'qualiguali-evidence',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    // Optional override for the URL stored on Evidence.fileUrl (e.g. a
    // public-facing MinIO/CDN host different from the internal endpoint).
    publicUrlBase: process.env.S3_PUBLIC_URL_BASE || null,
  },
};

if (!env.jwtSecret) {
  throw new Error('Missing required environment variable: JWT_SECRET');
}

module.exports = env;
