const express = require('express');
const { notFoundHandler, createErrorHandler, createCors, logger } = require('@qualiguali/shared');
const reportsRoutes = require('./routes/reports.routes');
const internalEventsRoutes = require('./routes/internalEvents.routes');

function createApp() {
  const app = express();

  app.use(createCors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use('/reports', reportsRoutes);
  app.use('/internal', internalEventsRoutes);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}

module.exports = createApp;
