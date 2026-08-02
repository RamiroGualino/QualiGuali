const express = require('express');
const { notFoundHandler, createErrorHandler, createCors, logger } = require('@qualiguali/shared');
const suitesRoutes = require('./routes/suites.routes');
const validationRunsRoutes = require('./routes/validationRuns.routes');

// Etapa 4 (docs/data-testing/etapa-4-api-suites.md) mounts `/suites`.
// Etapa 5 (docs/data-testing/etapa-5-api-corridas.md) mounts
// `/validation-runs`.
function createApp() {
  const app = express();

  app.use(createCors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use('/suites', suitesRoutes);
  app.use('/validation-runs', validationRunsRoutes);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}

module.exports = createApp;
