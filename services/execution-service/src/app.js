const express = require('express');
const { notFoundHandler, createErrorHandler, createCors, logger } = require('@qualiguali/shared');
const executionCyclesRoutes = require('./routes/executionCycles.routes');
const executionsRoutes = require('./routes/executions.routes');
const automationRunsRoutes = require('./routes/automationRuns.routes');
const postmanSuitesRoutes = require('./routes/postmanSuites.routes');
const postmanSchedulesRoutes = require('./routes/postmanSchedules.routes');

function createApp() {
  const app = express();

  app.use(createCors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use('/execution-cycles', executionCyclesRoutes);
  app.use('/executions', executionsRoutes);
  app.use('/execution', automationRunsRoutes);
  app.use('/postman-suites', postmanSuitesRoutes);
  app.use('/postman-schedules', postmanSchedulesRoutes);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}

module.exports = createApp;
