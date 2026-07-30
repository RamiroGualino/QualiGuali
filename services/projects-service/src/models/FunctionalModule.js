const mongoose = require('mongoose');

const functionalModuleSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    order: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model(
  'FunctionalModule',
  functionalModuleSchema,
  'projects_functionalModules',
);
