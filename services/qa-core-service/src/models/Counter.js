const mongoose = require('mongoose');

// _id is the natural key: `${projectId}:${prefix}` (e.g. "64f...:REQ"),
// which is what makes the increment below atomic and per-project.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema, 'qacore_counters');
