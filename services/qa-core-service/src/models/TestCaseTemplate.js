const mongoose = require('mongoose');

const templateFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, enum: ['text', 'number', 'boolean', 'select'], required: true },
    required: { type: Boolean, default: false },
    options: { type: [String], default: undefined },
  },
  { _id: false },
);

const testCaseTemplateSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    fields: { type: [templateFieldSchema], default: [] },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// At most one default template per project.
testCaseTemplateSchema.index(
  { projectId: 1 },
  { unique: true, partialFilterExpression: { isDefault: true } },
);

module.exports = mongoose.model(
  'TestCaseTemplate',
  testCaseTemplateSchema,
  'qacore_testCaseTemplates',
);
