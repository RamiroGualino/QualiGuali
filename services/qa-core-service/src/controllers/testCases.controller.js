const mongoose = require('mongoose');
const TestCase = require('../models/TestCase');
const TestCaseTemplate = require('../models/TestCaseTemplate');
const TestSuite = require('../models/TestSuite');
const { nextCode } = require('../services/counter.service');
const { assertProjectAndModule } = require('../services/projectValidation.service');
const { ensureDefaultTemplate } = require('../services/defaultTemplate.service');
const { validateCustomFields } = require('../services/customFields.service');

function notFound(res) {
  return res.status(404).json({ message: 'Test case not found' });
}

async function resolveTemplate(projectId, templateId) {
  if (templateId) {
    if (!mongoose.isValidObjectId(templateId)) return null;
    return TestCaseTemplate.findOne({ _id: templateId, projectId });
  }
  return ensureDefaultTemplate(projectId);
}

async function createTestCase(req, res, next) {
  try {
    const {
      projectId,
      moduleId,
      suiteId,
      templateId,
      testCaseId,
      title,
      summary,
      preconditions,
      steps,
      expectedResult,
      actualResult,
      postconditions,
      comments,
      customFields,
      priority,
      status,
      build,
      scenarioName,
      scenarioSummary,
      executionType,
      testingType,
      estimatedTime,
      assignee,
      automationUi,
      automationApi,
    } = req.body;

    if (!projectId || !title || !suiteId) {
      return res.status(400).json({ message: 'projectId, suiteId and title are required' });
    }

    if (!mongoose.isValidObjectId(suiteId)) {
      return res.status(400).json({ message: `Test suite "${suiteId}" does not exist` });
    }
    const suite = await TestSuite.findOne({ _id: suiteId, projectId });
    if (!suite) {
      return res.status(400).json({ message: `Test suite "${suiteId}" does not exist` });
    }

    await assertProjectAndModule(req.headers.authorization, projectId, moduleId);

    const template = await resolveTemplate(projectId, templateId);
    if (!template) {
      return res.status(400).json({ message: 'templateId does not exist for this project' });
    }

    const { valid, errors } = validateCustomFields(template.fields, customFields || {});
    if (!valid) {
      return res.status(400).json({ message: 'Invalid customFields', errors });
    }

    const code = await nextCode(projectId, 'TC');
    const testCase = await TestCase.create({
      projectId,
      moduleId,
      suiteId,
      templateId: template._id,
      code,
      testCaseId,
      title,
      summary,
      preconditions,
      steps,
      expectedResult,
      actualResult,
      postconditions,
      comments,
      customFields,
      priority,
      status,
      build,
      scenarioName,
      scenarioSummary,
      executionType,
      testingType,
      estimatedTime,
      assignee,
      automationUi,
      automationApi,
    });

    return res.status(201).json({ testCase });
  } catch (err) {
    return next(err);
  }
}

async function listTestCases(req, res, next) {
  try {
    const { projectId, suiteId } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (suiteId) filter.suiteId = suiteId;
    const testCases = await TestCase.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ testCases });
  } catch (err) {
    return next(err);
  }
}

async function getTestCase(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const testCase = await TestCase.findById(req.params.id);
    if (!testCase) return notFound(res);

    return res.status(200).json({ testCase });
  } catch (err) {
    return next(err);
  }
}

async function updateTestCase(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const existing = await TestCase.findById(req.params.id);
    if (!existing) return notFound(res);

    const {
      testCaseId,
      title,
      summary,
      preconditions,
      steps,
      expectedResult,
      actualResult,
      postconditions,
      comments,
      customFields,
      priority,
      status,
      build,
      moduleId,
      scenarioName,
      scenarioSummary,
      executionType,
      testingType,
      estimatedTime,
      assignee,
      automationUi,
      automationApi,
    } = req.body;

    if (customFields !== undefined) {
      const template = await TestCaseTemplate.findById(existing.templateId);
      const { valid, errors } = validateCustomFields(template ? template.fields : [], customFields);
      if (!valid) {
        return res.status(400).json({ message: 'Invalid customFields', errors });
      }
    }

    const testCase = await TestCase.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(testCaseId !== undefined && { testCaseId }),
          ...(title !== undefined && { title }),
          ...(summary !== undefined && { summary }),
          ...(preconditions !== undefined && { preconditions }),
          ...(steps !== undefined && { steps }),
          ...(expectedResult !== undefined && { expectedResult }),
          ...(actualResult !== undefined && { actualResult }),
          ...(postconditions !== undefined && { postconditions }),
          ...(comments !== undefined && { comments }),
          ...(customFields !== undefined && { customFields }),
          ...(priority !== undefined && { priority }),
          ...(status !== undefined && { status }),
          ...(build !== undefined && { build }),
          ...(moduleId !== undefined && { moduleId }),
          ...(scenarioName !== undefined && { scenarioName }),
          ...(scenarioSummary !== undefined && { scenarioSummary }),
          ...(executionType !== undefined && { executionType }),
          ...(testingType !== undefined && { testingType }),
          ...(estimatedTime !== undefined && { estimatedTime }),
          ...(assignee !== undefined && { assignee }),
          ...(automationUi !== undefined && { automationUi }),
          ...(automationApi !== undefined && { automationApi }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );

    return res.status(200).json({ testCase });
  } catch (err) {
    return next(err);
  }
}

async function deleteTestCase(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const testCase = await TestCase.findByIdAndDelete(req.params.id);
    if (!testCase) return notFound(res);

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createTestCase,
  listTestCases,
  getTestCase,
  updateTestCase,
  deleteTestCase,
};
