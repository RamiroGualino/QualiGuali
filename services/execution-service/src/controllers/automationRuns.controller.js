const mongoose = require('mongoose');
const { logger } = require('@qualiguali/shared');
const AutomationRun = require('../models/AutomationRun');
const AutomationTestResult = require('../models/AutomationTestResult');
const ExecutionCycle = require('../models/ExecutionCycle');
const PostmanSuite = require('../models/PostmanSuite');
const PostmanSuiteVersion = require('../models/PostmanSuiteVersion');
const projectsClient = require('../clients/projectsClient');
const s3Client = require('../clients/s3Client');
const { detectAndParse } = require('../services/automationIngestion.service');
const { buildRawReportUpload } = require('../services/rawReportBundle.service');
const { persistAutomationRun } = require('../services/automationRunPersistence.service');
const { isSuiteRunning } = require('../services/postmanRunner.service');
const { runAndPersistPostmanSuite } = require('../services/postmanSuiteRunOrchestrator.service');

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

    const automationRun = await persistAutomationRun({
      projectId,
      cycleId,
      tool,
      triggeredBy: req.auth.userId,
      summary,
      testResults,
      rawReportUrl,
    });

    return res.status(201).json({ automationRun });
  } catch (err) {
    return next(err);
  }
}

async function listAutomationRuns(req, res, next) {
  try {
    const { projectId, tool, from, to, postmanSuiteId } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (tool) filter.tool = tool;
    if (from || to) {
      filter.executedAt = {};
      if (from) filter.executedAt.$gte = new Date(from);
      if (to) filter.executedAt.$lte = new Date(to);
    }
    // Etapa 8 (docs/postman-runner/etapa-8-historial-y-auditoria.md): lets
    // the frontend pull a Suite's full run history — same controller, one
    // more filter, per the etapa's own "Diseño propuesto".
    if (postmanSuiteId) {
      if (!mongoose.isValidObjectId(postmanSuiteId)) {
        return res
          .status(400)
          .json({ message: `postmanSuiteId "${postmanSuiteId}" is not a valid id` });
      }
      filter.postmanSuiteId = postmanSuiteId;
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

// Etapa 6 (docs/postman-runner/etapa-6-programacion-automatica.md):
// re-triggers a Postman Suite run with the *exact* collection/environment
// files the original run used — not whatever the Suite currently points
// to, which may have moved on to a newer version since. Only meaningful for
// a run that came from a PostmanSuite in the first place (manual uploads
// and Allure runs have no Suite/version to pin to, so they 400).
async function retryAutomationRun(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Automation run not found' });
    }
    const originalRun = await AutomationRun.findById(req.params.id);
    if (!originalRun) {
      return res.status(404).json({ message: 'Automation run not found' });
    }
    if (!originalRun.postmanSuiteId) {
      return res.status(400).json({ message: 'Only Postman Suite runs can be retried' });
    }

    const suite = await PostmanSuite.findById(originalRun.postmanSuiteId);
    if (!suite) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }
    if (!suite.isActive) {
      return res.status(400).json({ message: 'Postman suite is not active' });
    }
    // Same best-effort pre-check triggerPostmanSuiteRun uses — the actual
    // guard is runSuite()'s own in-memory check, keyed by suite._id, which
    // a retry shares with every other trigger path for the same Suite.
    if (isSuiteRunning(suite._id)) {
      return res.status(409).json({ message: `Postman suite "${suite._id}" is already running` });
    }

    // Resolve the collection/environment file URLs *this run actually
    // used*, not the Suite's current ones — see AutomationRun.collectionVersion's
    // own comment. A version doc going missing (deleted out-of-band; there's
    // no delete endpoint for one today, but nothing stops a future one) is
    // surfaced as 409, not 500 — it's a legitimate "can't do that anymore"
    // outcome, not a server bug.
    let collectionFileUrl = suite.collectionFileUrl;
    if (originalRun.collectionVersion) {
      const collectionVersionDoc = await PostmanSuiteVersion.findOne({
        suiteId: suite._id,
        version: originalRun.collectionVersion,
      });
      if (!collectionVersionDoc) {
        return res.status(409).json({
          message: `Collection version ${originalRun.collectionVersion} is no longer available for this suite`,
        });
      }
      collectionFileUrl = collectionVersionDoc.collectionFileUrl;
    }

    let environmentFileUrl = null;
    if (originalRun.environmentVersion) {
      const environmentVersionDoc = await PostmanSuiteVersion.findOne({
        suiteId: suite._id,
        version: originalRun.environmentVersion,
      });
      if (!environmentVersionDoc || !environmentVersionDoc.environmentFileUrl) {
        return res.status(409).json({
          message: `Environment version ${originalRun.environmentVersion} is no longer available for this suite`,
        });
      }
      environmentFileUrl = environmentVersionDoc.environmentFileUrl;
    }

    // Not a real PostmanSuite document — just enough of one for runSuite()/
    // runAndPersistPostmanSuite() to work with (see that module's own
    // comment on why a plain object is fine here). timeoutMs comes from the
    // Suite's *current* value deliberately: that's an execution knob, not
    // part of "the same version", so retrying should use today's timeout
    // policy rather than whatever it happened to be back then.
    const pinnedSuite = {
      _id: suite._id,
      projectId: suite.projectId,
      collectionFileUrl,
      environmentFileUrl,
      timeoutMs: suite.timeoutMs,
      collectionVersion: originalRun.collectionVersion,
      environmentVersion: originalRun.environmentVersion,
    };

    res.status(202).json({ status: 'running', postmanSuiteId: suite._id.toString() });

    const triggeredBy = req.auth.userId;
    runAndPersistPostmanSuite(pinnedSuite, { triggerType: 'retry', triggeredBy }).catch((err) => {
      logger.error('Unexpected error retrying Postman suite run', {
        automationRunId: originalRun._id.toString(),
        postmanSuiteId: suite._id.toString(),
        error: err.message,
      });
    });

    return undefined;
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
  retryAutomationRun,
};
