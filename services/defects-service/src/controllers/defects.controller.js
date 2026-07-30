const mongoose = require('mongoose');
const Defect = require('../models/Defect');
const projectsClient = require('../clients/projectsClient');
const executionClient = require('../clients/executionClient');
const { nextCode } = require('../services/counter.service');
const { assertValidTransition } = require('../services/statusTransition.service');
const events = require('../services/events');

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

function notFound(res) {
  return res.status(404).json({ message: 'Defect not found' });
}

async function createDefect(req, res, next) {
  try {
    const {
      projectId,
      title,
      description,
      actualResult,
      severity,
      assignedTo,
      linkedExecutionId,
      linkedAutomationTestResultId,
      jiraUrl,
    } = req.body;

    if (!projectId || !title || !severity) {
      return res.status(400).json({ message: 'projectId, title and severity are required' });
    }

    if (!SEVERITIES.includes(severity)) {
      return res.status(400).json({ message: `severity must be one of: ${SEVERITIES.join(', ')}` });
    }

    const project = await projectsClient.getProject(projectId, req.headers.authorization);
    if (!project) {
      return res.status(400).json({ message: `Project "${projectId}" not found` });
    }

    if (linkedExecutionId) {
      const execution = await executionClient.getExecution(
        linkedExecutionId,
        req.headers.authorization,
      );
      if (!execution) {
        return res.status(400).json({ message: `Execution "${linkedExecutionId}" not found` });
      }
    }

    if (linkedAutomationTestResultId) {
      const testResult = await executionClient.getAutomationTestResult(
        linkedAutomationTestResultId,
        req.headers.authorization,
      );
      if (!testResult) {
        return res.status(400).json({
          message: `AutomationTestResult "${linkedAutomationTestResultId}" not found`,
        });
      }
    }

    const code = await nextCode(projectId);
    const defect = await Defect.create({
      projectId,
      code,
      title,
      description,
      actualResult,
      severity,
      reportedBy: req.auth.userId,
      assignedTo,
      linkedExecutionId,
      linkedAutomationTestResultId,
      jiraUrl,
    });

    events.publish('DefectCreated', {
      defectId: defect._id.toString(),
      projectId: defect.projectId,
      code: defect.code,
      severity: defect.severity,
      linkedExecutionId: defect.linkedExecutionId,
      linkedAutomationTestResultId: defect.linkedAutomationTestResultId,
    });

    return res.status(201).json({ defect });
  } catch (err) {
    return next(err);
  }
}

async function listDefects(req, res, next) {
  try {
    const { projectId, status, severity, linkedExecutionId } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (status) filter.status = status;
    if (severity) filter.severity = severity;
    if (linkedExecutionId) filter.linkedExecutionId = linkedExecutionId;

    const defects = await Defect.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ defects });
  } catch (err) {
    return next(err);
  }
}

async function getDefect(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const defect = await Defect.findById(req.params.id);
    if (!defect) return notFound(res);

    return res.status(200).json({ defect });
  } catch (err) {
    return next(err);
  }
}

async function updateDefect(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    if (req.body.status !== undefined) {
      return res.status(400).json({
        message: 'status cannot be changed here; use PATCH /defects/:id/status',
      });
    }

    const { title, description, actualResult, severity, assignedTo, jiraUrl } = req.body;
    if (severity !== undefined && !SEVERITIES.includes(severity)) {
      return res.status(400).json({ message: `severity must be one of: ${SEVERITIES.join(', ')}` });
    }

    const defect = await Defect.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(title !== undefined && { title }),
          ...(description !== undefined && { description }),
          ...(actualResult !== undefined && { actualResult }),
          ...(severity !== undefined && { severity }),
          ...(assignedTo !== undefined && { assignedTo }),
          ...(jiraUrl !== undefined && { jiraUrl }),
        },
      },
      { returnDocument: 'after', runValidators: true },
    );
    if (!defect) return notFound(res);

    return res.status(200).json({ defect });
  } catch (err) {
    return next(err);
  }
}

async function deleteDefect(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const defect = await Defect.findByIdAndDelete(req.params.id);
    if (!defect) return notFound(res);

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function updateDefectStatus(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const defect = await Defect.findById(req.params.id);
    if (!defect) return notFound(res);

    const { status: toStatus } = req.body;
    if (!toStatus) {
      return res.status(400).json({ message: 'status is required' });
    }

    try {
      assertValidTransition(defect.status, toStatus);
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message });
    }

    const fromStatus = defect.status;
    defect.status = toStatus;
    await defect.save();

    events.publish('DefectStatusChanged', {
      defectId: defect._id.toString(),
      projectId: defect.projectId,
      fromStatus,
      toStatus,
    });

    return res.status(200).json({ defect });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createDefect,
  listDefects,
  getDefect,
  updateDefect,
  deleteDefect,
  updateDefectStatus,
};
