const createApp = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { logger } = require('@qualiguali/shared');

async function start() {
  await connectDB(env.mongoUri);
  logger.info('Connected to MongoDB', { mongoUri: env.mongoUri });

  const app = createApp();
  app.listen(env.port, () => {
    logger.info(`data-testing-service listening on port ${env.port}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start data-testing-service', { error: err.message });
  process.exit(1);
});
