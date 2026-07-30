const mongoose = require('mongoose');
const TestPlan = require('../models/TestPlan');
const TestCase = require('../models/TestCase');
const { assertProjectAndModule } = require('../services/projectValidation.service');

function notFound(res) {
  return res.status(404).json({ message: 'Test plan not found' });
}

async function createTestPlan(req, res, next) {
  try {
    const { projectId, name, description, startDate, endDate, testCaseIds } = req.body;
    if (!projectId || !name) {
      return res.status(400).json({ message: 'projectId and name are required' });
    }

    await assertProjectAndModule(req.headers.authorization, projectId);

    const testPlan = await TestPlan.create({
      projectId,
      name,
      description,
      startDate,
      endDate,
      testCaseIds,
    });
    return res.status(201).json({ testPlan });
  } catch (err) {
    return next(err);
  }
}

async function listTestPlans(req, res, next) {
  try {
    const { projectId } = req.query;
    const filter = projectId ? { projectId } : {};
    const testPlans = await TestPlan.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ testPlans });
  } catch (err) {
    return next(err);
  }
}

async function getTestPlan(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const testPlan = await TestPlan.findById(req.params.id);
    if (!testPlan) return notFound(res);

    return res.status(200).json({ testPlan });
  } catch (err) {
    return next(err);
  }
}

async function updateTestPlan(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const { name, description, startDate, endDate, status } = req.body;
    const testPlan = await TestPlan.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(startDate !== undefined && { startDate }),
          ...(endDate !== undefined && { endDate }),
          ...(status !== undefined && { status }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!testPlan) return notFound(res);

    return res.status(200).json({ testPlan });
  } catch (err) {
    return next(err);
  }
}

async function deleteTestPlan(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const testPlan = await TestPlan.findByIdAndDelete(req.params.id);
    if (!testPlan) return notFound(res);

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function addTestCases(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const { testCaseIds } = req.body;
    if (!Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      return res.status(400).json({ message: 'testCaseIds must be a non-empty array' });
    }

    const testPlan = await TestPlan.findById(req.params.id);
    if (!testPlan) return notFound(res);

    const validIds = testCaseIds.filter((id) => mongoose.isValidObjectId(id));
    if (validIds.length !== testCaseIds.length) {
      return res.status(400).json({ message: 'One or more testCaseIds are malformed' });
    }

    const matchingCount = await TestCase.countDocuments({
      _id: { $in: validIds },
      projectId: testPlan.projectId,
    });
    if (matchingCount !== validIds.length) {
      return res
        .status(400)
        .json({ message: 'One or more testCaseIds do not exist in this project' });
    }

    const merged = Array.from(new Set([...testPlan.testCaseIds.map(String), ...validIds]));
    testPlan.testCaseIds = merged;
    await testPlan.save();

    return res.status(200).json({ testPlan });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createTestPlan,
  listTestPlans,
  getTestPlan,
  updateTestPlan,
  deleteTestPlan,
  addTestCases,
};
