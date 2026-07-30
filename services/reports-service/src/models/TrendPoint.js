const mongoose = require('mongoose');

const trendPointSchema = new mongoose.Schema({
  projectId: { type: String, required: true, index: true },
  cycleId: { type: String, required: true, index: true },
  date: { type: Date, required: true },
  passRate: { type: Number, default: null },
  origin: { type: String, enum: ['manual', 'allure', 'newman', 'combined'], required: true },
});

trendPointSchema.index({ projectId: 1, origin: 1, date: 1 });

module.exports = mongoose.model('TrendPoint', trendPointSchema, 'reports_trendPoints');
