const mongoose = require('mongoose');

const trendPointSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },
  // Etapa 5: a point produced at cycle-close time carries cycleId; a point
  // produced per live Postman Suite run (see handleAutomationRunIngested)
  // carries postmanSuiteId instead — there's no "cycle" for a Suite run to
  // belong to. Neither is `required` for the same reason as on FailedTest.
  cycleId: { type: String, default: null, index: true },
  postmanSuiteId: { type: String, default: null, index: true },
  date: { type: Date, required: true },
  passRate: { type: Number, default: null },
  origin: { type: String, enum: ['manual', 'allure', 'newman', 'combined'], required: true },
});

trendPointSchema.index({ projectId: 1, origin: 1, date: 1 });

module.exports = mongoose.model('TrendPoint', trendPointSchema, 'reports_trendPoints');
