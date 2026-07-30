const mongoose = require('mongoose');
const Execution = require('../models/Execution');
const ExecutionHistory = require('../models/ExecutionHistory');
const Evidence = require('../models/Evidence');
const { applyExecutionResult } = require('../services/executionResult.service');
const events = require('../services/events');

function notFound(res) {
  return res.status(404).json({ message: 'Execution not found' });
}

async function listExecutions(req, res, next) {
  try {
    const { cycleId } = req.query;
    const filter = cycleId ? { cycleId } : {};
    const executions = await Execution.find(filter).sort({ createdAt: 1 });
    return res.status(200).json({ executions });
  } catch (err) {
    return next(err);
  }
}

async function getExecution(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const execution = await Execution.findById(req.params.id);
    if (!execution) return notFound(res);

    return res.status(200).json({ execution });
  } catch (err) {
    return next(err);
  }
}

async function updateExecutionResult(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const existing = await Execution.findById(req.params.id);
    if (!existing) return notFound(res);

    let update;
    try {
      update = applyExecutionResult({
        status: req.body.status,
        comments: req.body.comments,
        executedBy: req.auth.userId,
      });
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message });
    }

    const execution = await Execution.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { returnDocument: 'after', runValidators: true },
    );

    // The Execution doc only ever holds the *current* result — this keeps
    // every past attempt so re-executing a case doesn't lose history.
    const history = await ExecutionHistory.create({
      executionId: execution._id,
      status: update.status,
      comments: update.comments,
      executedBy: update.executedBy,
      executedAt: update.executedAt,
    });

    // Claim every evidence file uploaded since the last attempt (uploaded
    // with no history to attach to yet — see evidence.controller.js) as
    // belonging to *this* attempt, the one it was just submitted with.
    await Evidence.updateMany(
      { executionId: execution._id, executionHistoryId: null },
      { $set: { executionHistoryId: history._id } },
    );

    events.publish('ExecutionUpdated', {
      executionId: execution._id.toString(),
      cycleId: execution.cycleId.toString(),
      testCaseId: execution.testCaseId,
      status: execution.status,
    });

    return res.status(200).json({ execution });
  } catch (err) {
    return next(err);
  }
}

async function listExecutionHistory(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const execution = await Execution.findById(req.params.id);
    if (!execution) return notFound(res);

    const history = await ExecutionHistory.find({ executionId: execution._id }).sort({
      executedAt: -1,
    });
    return res.status(200).json({ history });
  } catch (err) {
    return next(err);
  }
}

// Removing a mistaken/duplicate attempt. Its evidence goes with it — evidence
// tied to a history row that no longer exists would just look broken. If the
// deleted row was the current latest attempt, the Execution doc (which only
// ever mirrors "the latest result") is re-derived from whatever's now newest,
// or reset to not_executed if that was the only attempt — same shape
// applyExecutionResult produces, so every other screen reading Execution
// keeps working unchanged.
async function deleteExecutionHistoryEntry(req, res, next) {
  try {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !mongoose.isValidObjectId(req.params.historyId)
    ) {
      return res.status(404).json({ message: 'Execution history entry not found' });
    }

    const execution = await Execution.findById(req.params.id);
    if (!execution) return notFound(res);

    const entry = await ExecutionHistory.findOne({
      _id: req.params.historyId,
      executionId: execution._id,
    });
    if (!entry) {
      return res.status(404).json({ message: 'Execution history entry not found' });
    }

    const currentLatest = await ExecutionHistory.findOne({ executionId: execution._id }).sort({
      executedAt: -1,
    });
    const wasLatest = currentLatest && String(currentLatest._id) === String(entry._id);

    await Evidence.deleteMany({ executionHistoryId: entry._id });
    await ExecutionHistory.deleteOne({ _id: entry._id });

    if (wasLatest) {
      const newLatest = await ExecutionHistory.findOne({ executionId: execution._id }).sort({
        executedAt: -1,
      });
      const update = newLatest
        ? {
            status: newLatest.status,
            comments: newLatest.comments,
            executedBy: newLatest.executedBy,
            executedAt: newLatest.executedAt,
          }
        : { status: 'not_executed', comments: '', executedBy: null, executedAt: null };

      const updated = await Execution.findByIdAndUpdate(
        execution._id,
        { $set: update },
        { returnDocument: 'after', runValidators: true },
      );

      events.publish('ExecutionUpdated', {
        executionId: updated._id.toString(),
        cycleId: updated.cycleId.toString(),
        testCaseId: updated.testCaseId,
        status: updated.status,
      });
    }

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listExecutions,
  getExecution,
  updateExecutionResult,
  listExecutionHistory,
  deleteExecutionHistoryEntry,
};
