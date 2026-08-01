const mongoose = require('mongoose');
const PostmanSuite = require('../models/PostmanSuite');
const PostmanSuiteVersion = require('../models/PostmanSuiteVersion');
const PostmanSchedule = require('../models/PostmanSchedule');
const AutomationRun = require('../models/AutomationRun');
const AutomationTestResult = require('../models/AutomationTestResult');
const projectsClient = require('../clients/projectsClient');
const s3Client = require('../clients/s3Client');
const {
  validateCollectionFile,
  validateEnvironmentFile,
} = require('../services/postmanSuiteValidation.service');
const { compareRuns } = require('../services/compareRuns.service');
const { isSuiteRunning } = require('../services/postmanRunner.service');
const { unregisterSchedule } = require('../services/postmanScheduler.service');

// Live, in-memory concurrency state (see postmanRunner.service.js's
// runningSuiteIds Set) — never persisted on the PostmanSuite document
// itself, so every response that includes it computes it fresh. Lets the
// frontend poll for "is this Suite running right now" (any trigger source:
// manual, scheduled, retry) the same way a CI system like Jenkins shows a
// job's live in-progress state.
function withRunningState(postmanSuite) {
  return { ...postmanSuite.toObject(), isRunning: isSuiteRunning(postmanSuite._id) };
}

const UPDATABLE_FIELDS = ['name', 'description', 'timeoutMs', 'isActive'];

async function uploadSuiteFile(projectId, file) {
  const key = `postman-suites/${projectId}/${Date.now()}-${file.originalname}`;
  return s3Client.uploadObject(key, file.buffer, 'application/json');
}

async function createPostmanSuite(req, res, next) {
  try {
    const { projectId, requirementId, name, description, timeoutMs } = req.body;
    if (!projectId) {
      return res.status(400).json({ message: 'projectId is required' });
    }
    if (!name) {
      return res.status(400).json({ message: 'name is required' });
    }
    if (!requirementId) {
      return res.status(400).json({ message: 'requirementId is required' });
    }
    if (!mongoose.isValidObjectId(requirementId)) {
      return res
        .status(400)
        .json({ message: `requirementId "${requirementId}" is not a valid id` });
    }

    const collectionFile = req.files?.collection?.[0];
    if (!collectionFile) {
      return res
        .status(400)
        .json({ message: 'A collection file is required (field name: "collection")' });
    }
    const environmentFile = req.files?.environment?.[0];

    const project = await projectsClient.getProject(projectId, req.headers.authorization);
    if (!project) {
      return res.status(400).json({ message: `Project "${projectId}" not found` });
    }

    try {
      validateCollectionFile(collectionFile);
      if (environmentFile) validateEnvironmentFile(environmentFile);
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message });
    }

    const collectionFileUrl = await uploadSuiteFile(projectId, collectionFile);
    const environmentFileUrl = environmentFile
      ? await uploadSuiteFile(projectId, environmentFile)
      : null;

    const postmanSuite = await PostmanSuite.create({
      projectId,
      requirementId,
      name,
      description: description || '',
      collectionFileUrl,
      collectionVersion: 1,
      environmentFileUrl,
      environmentVersion: environmentFileUrl ? 1 : null,
      timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
      createdBy: req.auth.userId,
    });

    await PostmanSuiteVersion.create({
      suiteId: postmanSuite._id,
      collectionFileUrl,
      environmentFileUrl,
      version: 1,
      createdBy: req.auth.userId,
    });

    return res.status(201).json({ postmanSuite });
  } catch (err) {
    return next(err);
  }
}

async function listPostmanSuites(req, res, next) {
  try {
    const { projectId, requirementId, isActive } = req.query;
    const filter = {};
    if (projectId) filter.projectId = projectId;
    if (requirementId) {
      if (!mongoose.isValidObjectId(requirementId)) {
        return res
          .status(400)
          .json({ message: `requirementId "${requirementId}" is not a valid id` });
      }
      filter.requirementId = requirementId;
    }
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const postmanSuites = await PostmanSuite.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ postmanSuites: postmanSuites.map(withRunningState) });
  } catch (err) {
    return next(err);
  }
}

async function getPostmanSuite(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }
    const postmanSuite = await PostmanSuite.findById(req.params.id);
    if (!postmanSuite) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }
    return res.status(200).json({ postmanSuite: withRunningState(postmanSuite) });
  } catch (err) {
    return next(err);
  }
}

// Metadata only — name/description/timeoutMs/isActive. Replacing the
// collection/environment files goes through addPostmanSuiteVersion instead,
// so every file change is versioned rather than silently overwritten.
async function updatePostmanSuite(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }

    const updates = {};
    UPDATABLE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const postmanSuite = await PostmanSuite.findByIdAndUpdate(req.params.id, updates, {
      returnDocument: 'after',
      runValidators: true,
    });
    if (!postmanSuite) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }
    return res.status(200).json({ postmanSuite });
  } catch (err) {
    return next(err);
  }
}

// A new collection is always required per version bump; the environment is
// only replaced if one is uploaded this time — otherwise the Suite keeps
// pointing at whichever environment version was already active, so
// re-uploading just the collection doesn't force a pointless environment
// re-upload too.
async function addPostmanSuiteVersion(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }
    const suite = await PostmanSuite.findById(req.params.id);
    if (!suite) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }

    const collectionFile = req.files?.collection?.[0];
    if (!collectionFile) {
      return res
        .status(400)
        .json({ message: 'A collection file is required (field name: "collection")' });
    }
    const environmentFile = req.files?.environment?.[0];

    try {
      validateCollectionFile(collectionFile);
      if (environmentFile) validateEnvironmentFile(environmentFile);
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message });
    }

    const collectionFileUrl = await uploadSuiteFile(suite.projectId, collectionFile);
    const environmentFileUrl = environmentFile
      ? await uploadSuiteFile(suite.projectId, environmentFile)
      : null;

    const nextVersion = suite.collectionVersion + 1;

    const version = await PostmanSuiteVersion.create({
      suiteId: suite._id,
      collectionFileUrl,
      environmentFileUrl,
      version: nextVersion,
      createdBy: req.auth.userId,
    });

    suite.collectionFileUrl = collectionFileUrl;
    suite.collectionVersion = nextVersion;
    if (environmentFileUrl) {
      suite.environmentFileUrl = environmentFileUrl;
      suite.environmentVersion = nextVersion;
    }
    await suite.save();

    return res.status(201).json({ postmanSuite: suite, version });
  } catch (err) {
    return next(err);
  }
}

async function listPostmanSuiteVersions(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }
    const suite = await PostmanSuite.findById(req.params.id);
    if (!suite) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }

    const versions = await PostmanSuiteVersion.find({ suiteId: suite._id }).sort({ version: -1 });
    return res.status(200).json({ versions });
  } catch (err) {
    return next(err);
  }
}

// A real delete (not the isActive:false toggle PATCH already exposes for
// temporarily disabling a Suite you still want to keep) — same convention
// qa-core-service's TestSuite delete uses: remove the Suite and cascade to
// what only has meaning attached to it.
//
// PostmanSuiteVersion docs are cascaded: nothing can use one without its
// parent Suite (the retry endpoint's own PostmanSuite.findById already 404s
// before it would ever look a version up), so leaving them behind would
// just be orphaned garbage, never reachable again.
//
// PostmanSchedule docs are cascaded too, and — critically — unregistered
// from the live cron scheduler first; a schedule row left in Mongo without
// its in-memory node-cron task would just be inert, but an unregistered
// *task* still ticking against a suiteId that no longer resolves would
// fire runScheduledSuite() forever, logging an error every tick for a
// Suite that will never come back.
//
// AutomationRun documents are deliberately NOT touched — they're the
// permanent execution history/audit trail, not something that only makes
// sense alongside its Suite. The rest of the app already expects a run's
// Suite to potentially be gone (AutomationPage's "Suite Ejecutada" column
// falls back to automation.unknownSuite, and the retry endpoint already
// 404s with "Postman suite not found" for exactly this case).
async function deletePostmanSuite(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }

    const postmanSuite = await PostmanSuite.findById(req.params.id);
    if (!postmanSuite) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }

    const schedules = await PostmanSchedule.find({ suiteId: postmanSuite._id });
    schedules.forEach((schedule) => unregisterSchedule(schedule._id));
    await PostmanSchedule.deleteMany({ suiteId: postmanSuite._id });
    await PostmanSuiteVersion.deleteMany({ suiteId: postmanSuite._id });
    await postmanSuite.deleteOne();

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

// Etapa 8 (docs/postman-runner/etapa-8-historial-y-auditoria.md):
// GET /postman-suites/:id/compare?runA=&runB= — defaults to the two most
// recent runs of this Suite when neither is given (runB = later/current,
// runA = earlier/baseline, matching compareRuns()'s "passed in A, failed in
// B" regression direction). Both runs, whether defaulted or explicit, must
// belong to *this* Suite — comparing two unrelated runs wouldn't mean
// anything (different collections entirely).
async function compareSuiteRuns(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }
    const suite = await PostmanSuite.findById(req.params.id);
    if (!suite) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }

    const { runA: runAId, runB: runBId } = req.query;
    let runA;
    let runB;

    if (runAId || runBId) {
      if (!runAId || !runBId) {
        return res
          .status(400)
          .json({ message: 'Both runA and runB are required when either is provided' });
      }
      if (!mongoose.isValidObjectId(runAId) || !mongoose.isValidObjectId(runBId)) {
        return res.status(400).json({ message: 'runA/runB must be valid ids' });
      }

      [runA, runB] = await Promise.all([
        AutomationRun.findById(runAId),
        AutomationRun.findById(runBId),
      ]);
      if (!runA || !runB) {
        return res.status(404).json({ message: 'One or both runs were not found' });
      }
      const belongsToSuite = (run) =>
        run.postmanSuiteId && String(run.postmanSuiteId) === String(suite._id);
      if (!belongsToSuite(runA) || !belongsToSuite(runB)) {
        return res.status(400).json({ message: 'Both runs must belong to this Postman suite' });
      }
    } else {
      const recentRuns = await AutomationRun.find({ postmanSuiteId: suite._id })
        .sort({ executedAt: -1 })
        .limit(2);
      if (recentRuns.length < 2) {
        return res.status(400).json({ message: 'At least two runs are required to compare' });
      }
      [runB, runA] = recentRuns;
    }

    const [testResultsA, testResultsB] = await Promise.all([
      AutomationTestResult.find({ automationRunId: runA._id }),
      AutomationTestResult.find({ automationRunId: runB._id }),
    ]);

    const diff = compareRuns(testResultsA, testResultsB);

    return res.status(200).json({
      runA: { _id: runA._id, executedAt: runA.executedAt },
      runB: { _id: runB._id, executedAt: runB.executedAt },
      diff,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createPostmanSuite,
  listPostmanSuites,
  getPostmanSuite,
  updatePostmanSuite,
  addPostmanSuiteVersion,
  compareSuiteRuns,
  listPostmanSuiteVersions,
  deletePostmanSuite,
};
