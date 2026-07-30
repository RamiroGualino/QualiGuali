const TestCaseTemplate = require('../models/TestCaseTemplate');

// A Project lives in projects-service, so nothing there can synchronously
// trigger template creation here without a new cross-service call direction
// (and this part has no event bus yet). Instead this service *ensures* the
// default template exists lazily, the first time it's needed for a project
// (listing templates, or creating a TestCase without an explicit templateId).
const DEFAULT_TEMPLATE_FIELDS = [
  { key: 'description', label: 'Descripción', type: 'text', required: false },
  { key: 'evidence', label: 'Evidencia', type: 'text', required: false },
];

async function ensureDefaultTemplate(projectId) {
  const existing = await TestCaseTemplate.findOne({ projectId, isDefault: true });
  if (existing) return existing;

  try {
    return await TestCaseTemplate.create({
      projectId,
      name: 'Default',
      fields: DEFAULT_TEMPLATE_FIELDS,
      isDefault: true,
    });
  } catch (err) {
    if (err.code === 11000) {
      // Lost a creation race — another request already made the default.
      return TestCaseTemplate.findOne({ projectId, isDefault: true });
    }
    throw err;
  }
}

module.exports = { ensureDefaultTemplate, DEFAULT_TEMPLATE_FIELDS };
