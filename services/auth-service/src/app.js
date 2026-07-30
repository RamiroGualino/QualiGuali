const express = require('express');
const { notFoundHandler, createErrorHandler, createCors, logger } = require('@qualiguali/shared');
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');

function createApp() {
  const app = express();

  app.use(createCors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use('/auth', authRoutes);
  app.use('/users', usersRoutes);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}

module.exports = createApp;
