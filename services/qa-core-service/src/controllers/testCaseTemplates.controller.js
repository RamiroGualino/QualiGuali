const mongoose = require('mongoose');
const TestCaseTemplate = require('../models/TestCaseTemplate');
const { ensureDefaultTemplate } = require('../services/defaultTemplate.service');
const { assertProjectAndModule } = require('../services/projectValidation.service');

function notFound(res) {
  return res.status(404).json({ message: 'Test case template not found' });
}

async function createTemplate(req, res, next) {
  try {
    const { projectId, name, fields } = req.body;
    if (!projectId || !name) {
      return res.status(400).json({ message: 'projectId and name are required' });
    }

    await assertProjectAndModule(req.headers.authorization, projectId);

    const template = await TestCaseTemplate.create({ projectId, name, fields });
    return res.status(201).json({ template });
  } catch (err) {
    return next(err);
  }
}

async function listTemplates(req, res, next) {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ message: 'projectId query param is required' });
    }

    await assertProjectAndModule(req.headers.authorization, projectId);
    await ensureDefaultTemplate(projectId);

    const templates = await TestCaseTemplate.find({ projectId }).sort({ createdAt: 1 });
    return res.status(200).json({ templates });
  } catch (err) {
    return next(err);
  }
}

async function getTemplate(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const template = await TestCaseTemplate.findById(req.params.id);
    if (!template) return notFound(res);

    return res.status(200).json({ template });
  } catch (err) {
    return next(err);
  }
}

async function updateTemplate(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const { name, fields } = req.body;
    const template = await TestCaseTemplate.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(name !== undefined && { name }),
          ...(fields !== undefined && { fields }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!template) return notFound(res);

    return res.status(200).json({ template });
  } catch (err) {
    return next(err);
  }
}

async function deleteTemplate(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const template = await TestCaseTemplate.findById(req.params.id);
    if (!template) return notFound(res);

    if (template.isDefault) {
      return res.status(400).json({ message: 'The default template cannot be deleted' });
    }

    await template.deleteOne();
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { createTemplate, listTemplates, getTemplate, updateTemplate, deleteTemplate };
