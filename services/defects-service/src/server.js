const createApp = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { ensureBucket } = require('./clients/s3Client');
const { logger } = require('@qualiguali/shared');

async function start() {
  await connectDB(env.mongoUri);
  logger.info('Connected to MongoDB', { mongoUri: env.mongoUri });

  await ensureBucket();
  logger.info('S3/MinIO bucket ready', { bucket: env.s3.bucket });

  const app = createApp();
  app.listen(env.port, () => {
    logger.info(`defects-service listening on port ${env.port}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start defects-service', { error: err.message });
  process.exit(1);
});
