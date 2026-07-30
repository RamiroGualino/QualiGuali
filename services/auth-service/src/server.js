const createApp = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { logger } = require('@qualiguali/shared');

async function start() {
  await connectDB(env.mongoUri);
  logger.info('Connected to MongoDB', { mongoUri: env.mongoUri });

  const app = createApp();
  app.listen(env.port, () => {
    logger.info(`auth-service listening on port ${env.port}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start auth-service', { error: err.message });
  process.exit(1);
});
