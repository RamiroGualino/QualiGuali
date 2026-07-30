const CycleReport = require('../models/CycleReport');
const TrendPoint = require('../models/TrendPoint');
const FailedTest = require('../models/FailedTest');
const executionClient = require('../clients/executionClient');
const { logger } = require('@qualiguali/shared');

async function getCycleReport(req, res, next) {
  try {
    const report = await CycleReport.findOne({ cycleId: req.params.cycleId });
    if (!report) {
      return res.status(404).json({ message: 'No report found for this cycle yet' });
    }

    return res.status(200).json({ report });
  } catch (err) {
    return next(err);
  }
}

async function getProjectTrend(req, res, next) {
  try {
    const { projectId } = req.params;
    const { from, to, origin } = req.query;

    const filter = { projectId };
    if (origin) filter.origin = origin;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    const trend = await TrendPoint.find(filter).sort({ date: 1 });
    return res.status(200).json({ trend });
  } catch (err) {
    return next(err);
  }
}

// Evidence isn't denormalized (no domain event is published when evidence is
// uploaded — see README), so manual failures resolve it live, best-effort,
// only for the small set of already-known failures being returned here.
async function attachManualEvidence(failures) {
  return Promise.all(
    failures.map(async (failure) => {
      const plain = failure.toObject();
      if (failure.origin !== 'manual') return plain;

      try {
        const evidence = await executionClient.getExecutionEvidence(failure.sourceId);
        return { ...plain, evidence };
      } catch (err) {
        logger.error('Could not fetch evidence for a manual failure', {
          executionId: failure.sourceId,
          error: err.message,
        });
        return { ...plain, evidence: [] };
      }
    }),
  );
}

async function getCycleFailures(req, res, next) {
  try {
    const { origin, module: moduleId } = req.query;

    const filter = { cycleId: req.params.cycleId };
    if (origin) filter.origin = origin;
    if (moduleId) filter.moduleId = moduleId;

    const failures = await FailedTest.find(filter).sort({ origin: 1, testName: 1 });
    const withEvidence = await attachManualEvidence(failures);

    return res.status(200).json({ failures: withEvidence });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getCycleReport, getProjectTrend, getCycleFailures };
