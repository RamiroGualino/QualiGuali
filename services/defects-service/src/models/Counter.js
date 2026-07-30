const mongoose = require('mongoose');

// _id is the natural key: `${projectId}:DEF`, which is what makes the
// increment in @qualiguali/shared's nextCode atomic and per-project.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema, 'defects_counters');
