const mongoose = require('mongoose');
const TestSuite = require('../models/TestSuite');
const Requirement = require('../models/Requirement');
const TestCase = require('../models/TestCase');

function notFound(res) {
  return res.status(404).json({ message: 'Test suite not found' });
}

async function createTestSuite(req, res, next) {
  try {
    const { projectId, requirementId, name, description } = req.body;
    if (!projectId || !requirementId || !name) {
      return res.status(400).json({ message: 'projectId, requirementId and name are required' });
    }

    if (!mongoose.isValidObjectId(requirementId)) {
      return res.status(400).json({ message: `Requirement "${requirementId}" does not exist` });
    }
    const requirement = await Requirement.findOne({ _id: requirementId, projectId });
    if (!requirement) {
      return res.status(400).json({ message: `Requirement "${requirementId}" does not exist` });
    }

    const testSuite = await TestSuite.create({ projectId, requirementId, name, description });
    return res.status(201).json({ testSuite });
  } catch (err) {
    return next(err);
  }
}

async function listTestSuites(req, res, next) {
  try {
    const { projectId, requirementId } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (requirementId) filter.requirementId = requirementId;

    const testSuites = await TestSuite.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ testSuites });
  } catch (err) {
    return next(err);
  }
}

async function getTestSuite(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const testSuite = await TestSuite.findById(req.params.id);
    if (!testSuite) return notFound(res);

    return res.status(200).json({ testSuite });
  } catch (err) {
    return next(err);
  }
}

async function updateTestSuite(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const { name, description } = req.body;
    const testSuite = await TestSuite.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!testSuite) return notFound(res);

    return res.status(200).json({ testSuite });
  } catch (err) {
    return next(err);
  }
}

async function deleteTestSuite(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const testSuite = await TestSuite.findById(req.params.id);
    if (!testSuite) return notFound(res);

    // Cascade: a test case only exists in the context of its suite, so
    // deleting the suite takes its test cases with it rather than blocking
    // until they're removed one by one. Any existing Execution rows that
    // pointed at one of them are left as-is (execution-service already
    // degrades gracefully when a testCaseId no longer resolves).
    await TestCase.deleteMany({ suiteId: testSuite._id });
    await testSuite.deleteOne();
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createTestSuite,
  listTestSuites,
  getTestSuite,
  updateTestSuite,
  deleteTestSuite,
};
