const mongoose = require('mongoose');
const AutomationRun = require('../models/AutomationRun');
const AutomationTestResult = require('../models/AutomationTestResult');
const ExecutionCycle = require('../models/ExecutionCycle');
const projectsClient = require('../clients/projectsClient');
const s3Client = require('../clients/s3Client');
const { detectAndParse } = require('../services/automationIngestion.service');
const { buildRawReportUpload } = require('../services/rawReportBundle.service');
const events = require('../services/events');

function parseUploadedFiles(files) {
  return files.map((file) => {
    try {
      return JSON.parse(file.buffer.toString('utf8'));
    } catch (_err) {
      const err = new Error(`Invalid JSON in uploaded file "${file.originalname}"`);
      err.status = 400;
      throw err;
    }
  });
}

async function createAutomationRun(req, res, next) {
  try {
    const { projectId, cycleId } = req.body;
    if (!projectId) {
      return res.status(400).json({ message: 'projectId is required' });
    }

    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ message: 'At least one report file is required (field name: "files")' });
    }

    if (cycleId) {
      if (!mongoose.isValidObjectId(cycleId)) {
        return res.status(400).json({ message: `cycleId "${cycleId}" is not a valid id` });
      }
      const cycle = await ExecutionCycle.findById(cycleId);
      if (!cycle) {
        return res.status(400).json({ message: `Execution cycle "${cycleId}" not found` });
      }
    }

    const project = await projectsClient.getProject(projectId, req.headers.authorization);
    if (!project) {
      return res.status(400).json({ message: `Project "${projectId}" not found` });
    }

    let parsedFiles;
    let ingestion;
    try {
      parsedFiles = parseUploadedFiles(req.files);
      ingestion = detectAndParse(req.body.tool, parsedFiles);
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message });
    }

    const { tool, summary, testResults } = ingestion;

    const rawUpload = buildRawReportUpload(req.files);
    const key = `automation-runs/${tool}/${Date.now()}-${rawUpload.filename}`;
    const rawReportUrl = await s3Client.uploadObject(key, rawUpload.buffer, rawUpload.contentType);

    const automationRun = await AutomationRun.create({
      projectId,
      cycleId: cycleId || null,
      tool,
      triggeredBy: req.auth.userId,
      rawReportUrl,
      totalTests: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      broken: summary.broken,
      skipped: summary.skipped,
      durationMs: summary.durationMs,
      executedAt: summary.executedAt,
    });

    if (testResults.length > 0) {
      await AutomationTestResult.insertMany(
        testResults.map((testResult) => ({ ...testResult, automationRunId: automationRun._id })),
      );
    }

    events.publish('AutomationRunIngested', {
      automationRunId: automationRun._id.toString(),
      projectId: automationRun.projectId,
      cycleId: automationRun.cycleId ? automationRun.cycleId.toString() : null,
      tool: automationRun.tool,
      summary: {
        total: automationRun.totalTests,
        passed: automationRun.passed,
        failed: automationRun.failed,
        broken: automationRun.broken,
        skipped: automationRun.skipped,
      },
      executedAt: automationRun.executedAt.toISOString(),
    });

    return res.status(201).json({ automationRun });
  } catch (err) {
    return next(err);
  }
}

async function listAutomationRuns(req, res, next) {
  try {
    const { projectId, tool, from, to } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (tool) filter.tool = tool;
    if (from || to) {
      filter.executedAt = {};
      if (from) filter.executedAt.$gte = new Date(from);
      if (to) filter.executedAt.$lte = new Date(to);
    }

    const automationRuns = await AutomationRun.find(filter).sort({ executedAt: -1 });
    return res.status(200).json({ automationRuns });
  } catch (err) {
    return next(err);
  }
}

// Used by reports-service to fetch a run's rawReportUrl when persisting a
// failure record for one of its failed/broken tests.
async function getAutomationRun(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Automation run not found' });
    }

    const automationRun = await AutomationRun.findById(req.params.id);
    if (!automationRun) {
      return res.status(404).json({ message: 'Automation run not found' });
    }

    return res.status(200).json({ automationRun });
  } catch (err) {
    return next(err);
  }
}

async function listAutomationRunTests(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Automation run not found' });
    }

    const automationRun = await AutomationRun.findById(req.params.id);
    if (!automationRun) {
      return res.status(404).json({ message: 'Automation run not found' });
    }

    const filter = { automationRunId: automationRun._id };
    if (req.query.status) filter.status = req.query.status;

    const testResults = await AutomationTestResult.find(filter).sort({ suiteName: 1, testName: 1 });
    return res.status(200).json({ testResults });
  } catch (err) {
    return next(err);
  }
}

// Lets other services (defects-service, linking a defect to a failed test)
// validate an AutomationTestResult by id without depending on its parent run.
async function getAutomationTestResult(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Automation test result not found' });
    }

    const testResult = await AutomationTestResult.findById(req.params.id);
    if (!testResult) {
      return res.status(404).json({ message: 'Automation test result not found' });
    }

    return res.status(200).json({ testResult });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createAutomationRun,
  listAutomationRuns,
  getAutomationRun,
  listAutomationRunTests,
  getAutomationTestResult,
};
