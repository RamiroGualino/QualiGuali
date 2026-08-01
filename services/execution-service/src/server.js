const createApp = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { ensureBucket } = require('./clients/s3Client');
const { bootstrapSchedules } = require('./services/postmanScheduler.service');
const { logger } = require('@qualiguali/shared');

async function start() {
  await connectDB(env.mongoUri);
  logger.info('Connected to MongoDB', { mongoUri: env.mongoUri });

  await ensureBucket();
  logger.info('S3/MinIO bucket ready', { bucket: env.s3.bucket });

  // Etapa 6 (docs/postman-runner/etapa-6-programacion-automatica.md):
  // registers every active PostmanSchedule as a real node-cron task —
  // without this, schedules created before the last restart would silently
  // stop firing until each was edited (which re-registers it) or the API
  // grew its own separate reload endpoint.
  await bootstrapSchedules();

  const app = createApp();
  app.listen(env.port, () => {
    logger.info(`execution-service listening on port ${env.port}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start execution-service', { error: err.message });
  process.exit(1);
});
