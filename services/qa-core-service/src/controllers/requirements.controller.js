const mongoose = require('mongoose');
const Requirement = require('../models/Requirement');
const TestSuite = require('../models/TestSuite');
const TestCase = require('../models/TestCase');
const { nextCode } = require('../services/counter.service');
const { assertProjectAndModule } = require('../services/projectValidation.service');

function notFound(res) {
  return res.status(404).json({ message: 'Requirement not found' });
}

async function createRequirement(req, res, next) {
  try {
    const { projectId, moduleId, title, description, priority, status, jiraUrl } = req.body;
    if (!projectId || !title) {
      return res.status(400).json({ message: 'projectId and title are required' });
    }

    await assertProjectAndModule(req.headers.authorization, projectId, moduleId);

    const code = await nextCode(projectId, 'REQ');
    const requirement = await Requirement.create({
      projectId,
      moduleId,
      code,
      title,
      description,
      priority,
      status,
      jiraUrl,
    });

    return res.status(201).json({ requirement });
  } catch (err) {
    return next(err);
  }
}

async function listRequirements(req, res, next) {
  try {
    const { projectId, moduleId } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (moduleId) filter.moduleId = moduleId;
    const requirements = await Requirement.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ requirements });
  } catch (err) {
    return next(err);
  }
}

async function getRequirement(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) return notFound(res);

    return res.status(200).json({ requirement });
  } catch (err) {
    return next(err);
  }
}

async function updateRequirement(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const { title, description, priority, status, jiraUrl } = req.body;
    const requirement = await Requirement.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(priority !== undefined && { priority }),
          ...(status !== undefined && { status }),
          ...(jiraUrl !== undefined && { jiraUrl }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!requirement) return notFound(res);

    return res.status(200).json({ requirement });
  } catch (err) {
    return next(err);
  }
}

// Resolves every TestCase transitively linked to a Requirement through its
// Test Suites — used by execution-service to bootstrap a cycle "from
// Requirements" (see PROMPT's Ciclo de Prueba requirement) and by the
// frontend's requirement detail view.
async function listRequirementTestCases(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) return notFound(res);

    const testSuites = await TestSuite.find({ requirementId: requirement._id }, '_id');
    const suiteIds = testSuites.map((suite) => suite._id);
    const testCases = await TestCase.find({ suiteId: { $in: suiteIds } }).sort({ createdAt: -1 });

    return res.status(200).json({ testCases });
  } catch (err) {
    return next(err);
  }
}

async function deleteRequirement(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const requirement = await Requirement.findById(req.params.id);
    if (!requirement) return notFound(res);

    const linkedSuiteCount = await TestSuite.countDocuments({ requirementId: requirement._id });
    if (linkedSuiteCount > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${linkedSuiteCount} test suite(s) still belong to this requirement.`,
      });
    }

    await requirement.deleteOne();
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createRequirement,
  listRequirements,
  getRequirement,
  listRequirementTestCases,
  updateRequirement,
  deleteRequirement,
};
