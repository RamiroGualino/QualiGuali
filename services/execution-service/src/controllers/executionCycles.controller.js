const mongoose = require('mongoose');
const ExecutionCycle = require('../models/ExecutionCycle');
const Execution = require('../models/Execution');
const Evidence = require('../models/Evidence');
const qaCoreClient = require('../clients/qaCoreClient');
const { bootstrapExecutions } = require('../services/cycleBootstrap.service');
const events = require('../services/events');

function notFound(res) {
  return res.status(404).json({ message: 'Execution cycle not found' });
}

async function createExecutionCycle(req, res, next) {
  try {
    const {
      projectId,
      testPlanId,
      requirementIds,
      suiteId,
      name,
      description,
      assignee,
      priority,
      startDate,
      endDate,
      testCaseIds,
    } = req.body;
    if (!projectId || !name) {
      return res.status(400).json({ message: 'projectId and name are required' });
    }

    const cycle = await ExecutionCycle.create({
      projectId,
      testPlanId,
      requirementIds,
      suiteId,
      name,
      description,
      assignee,
      priority,
      startDate,
      endDate,
    });

    // An explicit testCaseIds list (e.g. curated from a Suite's cases) is
    // the caller stating precisely which cases to bootstrap — it takes over
    // entirely instead of also auto-resolving testPlanId/requirementIds, so
    // a cycle isn't seeded with more cases than the ones actually chosen.
    const hasExplicitTestCaseIds = Array.isArray(testCaseIds) && testCaseIds.length > 0;
    const hasTestPlan = !hasExplicitTestCaseIds && Boolean(testPlanId);
    const hasRequirements =
      !hasExplicitTestCaseIds && Array.isArray(requirementIds) && requirementIds.length > 0;

    if (hasExplicitTestCaseIds || hasTestPlan || hasRequirements) {
      try {
        const testCaseIdSet = new Set();

        if (hasExplicitTestCaseIds) {
          testCaseIds.forEach((testCaseId) => testCaseIdSet.add(testCaseId));
        }

        if (hasTestPlan) {
          const testPlan = await qaCoreClient.getTestPlan(testPlanId, req.headers.authorization);
          if (!testPlan) {
            const err = new Error(`TestPlan "${testPlanId}" not found`);
            err.status = 400;
            throw err;
          }
          testPlan.testCaseIds.forEach((testCaseId) => testCaseIdSet.add(testCaseId));
        }

        if (hasRequirements) {
          const resolvedIds = await qaCoreClient.resolveTestCaseIdsFromRequirements(
            requirementIds,
            req.headers.authorization,
          );
          resolvedIds.forEach((testCaseId) => testCaseIdSet.add(testCaseId));
        }

        await bootstrapExecutions({
          cycleId: cycle._id,
          testCaseIds: Array.from(testCaseIdSet),
          authorization: req.headers.authorization,
        });
      } catch (err) {
        await cycle.deleteOne();
        throw err;
      }
    }

    return res.status(201).json({ executionCycle: cycle });
  } catch (err) {
    return next(err);
  }
}

async function listExecutionCycles(req, res, next) {
  try {
    const { projectId } = req.query;
    const filter = projectId ? { projectId } : {};
    const executionCycles = await ExecutionCycle.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ executionCycles });
  } catch (err) {
    return next(err);
  }
}

async function getExecutionCycle(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const cycle = await ExecutionCycle.findById(req.params.id);
    if (!cycle) return notFound(res);

    return res.status(200).json({ executionCycle: cycle });
  } catch (err) {
    return next(err);
  }
}

async function listCycleExecutions(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const cycle = await ExecutionCycle.findById(req.params.id);
    if (!cycle) return notFound(res);

    const executions = await Execution.find({ cycleId: cycle._id }).sort({ createdAt: 1 });
    return res.status(200).json({ executions });
  } catch (err) {
    return next(err);
  }
}

async function updateExecutionCycle(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const { name, description, assignee, priority, startDate, endDate, status } = req.body;
    if (status !== undefined && !['planned', 'in_progress'].includes(status)) {
      return res.status(400).json({
        message:
          'status can only be set to "planned" or "in_progress" here; use POST /execution-cycles/:id/close to close a cycle',
      });
    }

    const cycle = await ExecutionCycle.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(assignee !== undefined && { assignee }),
          ...(priority !== undefined && { priority }),
          ...(startDate !== undefined && { startDate }),
          ...(endDate !== undefined && { endDate }),
          ...(status !== undefined && { status }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!cycle) return notFound(res);

    return res.status(200).json({ executionCycle: cycle });
  } catch (err) {
    return next(err);
  }
}

// Clones a cycle's setup (same plan/suite/metadata) and re-bootstraps fresh
// not_executed Executions for the same set of test cases — lets a user
// re-run a cycle without redoing the Suite case-picking step.
async function duplicateExecutionCycle(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const original = await ExecutionCycle.findById(req.params.id);
    if (!original) return notFound(res);

    const duplicate = await ExecutionCycle.create({
      projectId: original.projectId,
      testPlanId: original.testPlanId,
      requirementIds: original.requirementIds,
      suiteId: original.suiteId,
      name: `${original.name} (copy)`,
      description: original.description,
      assignee: original.assignee,
      priority: original.priority,
    });

    try {
      const executions = await Execution.find({ cycleId: original._id }, 'testCaseId');
      await bootstrapExecutions({
        cycleId: duplicate._id,
        testCaseIds: executions.map((execution) => execution.testCaseId),
        authorization: req.headers.authorization,
      });
    } catch (err) {
      await duplicate.deleteOne();
      throw err;
    }

    return res.status(201).json({ executionCycle: duplicate });
  } catch (err) {
    return next(err);
  }
}

async function deleteExecutionCycle(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const cycle = await ExecutionCycle.findByIdAndDelete(req.params.id);
    if (!cycle) return notFound(res);

    const executions = await Execution.find({ cycleId: cycle._id }, '_id');
    const executionIds = executions.map((execution) => execution._id);
    await Evidence.deleteMany({ executionId: { $in: executionIds } });
    await Execution.deleteMany({ cycleId: cycle._id });

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function closeExecutionCycle(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const cycle = await ExecutionCycle.findById(req.params.id);
    if (!cycle) return notFound(res);

    if (cycle.status === 'closed') {
      return res.status(400).json({ message: 'Execution cycle is already closed' });
    }

    const force = Boolean(req.body?.force);
    if (!force) {
      const pendingCount = await Execution.countDocuments({
        cycleId: cycle._id,
        status: 'not_executed',
      });
      if (pendingCount > 0) {
        return res.status(409).json({
          message: `${pendingCount} execution(s) are still not_executed. Pass { "force": true } to close anyway.`,
          pendingCount,
        });
      }
    }

    cycle.status = 'closed';
    cycle.endDate = cycle.endDate || new Date();
    await cycle.save();

    events.publish('CycleFinished', {
      cycleId: cycle._id.toString(),
      projectId: cycle.projectId,
      forced: force,
    });

    return res.status(200).json({ executionCycle: cycle });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createExecutionCycle,
  listExecutionCycles,
  getExecutionCycle,
  listCycleExecutions,
  updateExecutionCycle,
  deleteExecutionCycle,
  closeExecutionCycle,
  duplicateExecutionCycle,
};
