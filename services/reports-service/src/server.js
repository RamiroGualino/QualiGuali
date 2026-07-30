const createApp = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { createSqsConsumer } = require('./consumers/sqsConsumer');
const { logger } = require('@qualiguali/shared');

async function start() {
  await connectDB(env.mongoUri);
  logger.info('Connected to MongoDB', { mongoUri: env.mongoUri });

  const app = createApp();
  app.listen(env.port, () => {
    logger.info(`reports-service listening on port ${env.port}`);
  });

  if (env.aws.queueUrl) {
    const consumer = createSqsConsumer();
    // Fire-and-forget: the poll loop runs alongside the HTTP server for the
    // lifetime of the process.
    consumer.start().catch((err) => {
      logger.error('SQS consumer crashed', { error: err.message });
    });
  } else {
    logger.info('SQS_QUEUE_URL not set — event consumer disabled (read endpoints still work)');
  }
}

start().catch((err) => {
  logger.error('Failed to start reports-service', { error: err.message });
  process.exit(1);
});
