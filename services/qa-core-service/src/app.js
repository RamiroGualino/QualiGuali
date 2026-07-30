const express = require('express');
const { notFoundHandler, createErrorHandler, createCors, logger } = require('@qualiguali/shared');
const requirementsRoutes = require('./routes/requirements.routes');
const testSuitesRoutes = require('./routes/testSuites.routes');
const testCaseTemplatesRoutes = require('./routes/testCaseTemplates.routes');
const testCasesRoutes = require('./routes/testCases.routes');
const testPlansRoutes = require('./routes/testPlans.routes');

function createApp() {
  const app = express();

  app.use(createCors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));
  app.use('/requirements', requirementsRoutes);
  app.use('/test-suites', testSuitesRoutes);
  app.use('/test-case-templates', testCaseTemplatesRoutes);
  app.use('/test-cases', testCasesRoutes);
  app.use('/test-plans', testPlansRoutes);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}

module.exports = createApp;
