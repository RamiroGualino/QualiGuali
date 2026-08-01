const CycleReport = require('../models/CycleReport');
const TrendPoint = require('../models/TrendPoint');
const ExecutionIndex = require('../models/ExecutionIndex');
const AutomationRunIndex = require('../models/AutomationRunIndex');
const FailedTest = require('../models/FailedTest');
const executionClient = require('../clients/executionClient');
const qaCoreClient = require('../clients/qaCoreClient');
const { computeManualDelta } = require('./manualDelta');
const { resolveProjectIdForCycle, resolveCycleIdForDefect } = require('./cycleResolution');
const {
  shouldNotify,
  createAutomationRunFailedNotification,
} = require('../services/notifications.service');
const { logger } = require('@qualiguali/shared');

async function handleExecutionUpdated(payload) {
  const { executionId, cycleId, status, comments, testCaseId } = payload;

  const projectId = await resolveProjectIdForCycle(cycleId);
  if (!projectId) {
    logger.error('Skipping ExecutionUpdated: could not resolve projectId for cycle', { cycleId });
    return;
  }

  const previous = await ExecutionIndex.findOneAndUpdate(
    { _id: executionId },
    { $set: { cycleId, projectId, status } },
    { upsert: true, returnDocument: 'before' },
  );

  const delta = computeManualDelta({
    prevStatus: previous ? previous.status : null,
    newStatus: status,
    isNewExecution: !previous,
  });

  await CycleReport.findOneAndUpdate(
    { cycleId },
    { $set: { projectId }, $inc: delta },
    { upsert: true, setDefaultsOnInsert: true },
  );

  if (status === 'fail') {
    // The event only carries testCaseId — resolve it to "TC-006: Crear
    // proyecto" for the failures drill-down instead of showing the raw id.
    // Best-effort: if qa-core-service is unreachable or the case was since
    // deleted, fall back to the id rather than losing the failure record.
    let testName = testCaseId;
    try {
      const testCase = await qaCoreClient.getTestCase(testCaseId);
      if (testCase) testName = `${testCase.code}: ${testCase.title}`;
    } catch (err) {
      logger.error('Could not resolve test case name for failures drill-down', {
        testCaseId,
        error: err.message,
      });
    }

    await FailedTest.findOneAndUpdate(
      { origin: 'manual', sourceId: executionId },
      {
        $set: {
          cycleId,
          projectId,
          origin: 'manual',
          sourceId: executionId,
          testName,
          status,
          comments: comments || null,
        },
      },
      { upsert: true },
    );
  } else {
    // No longer failing (re-run passed/blocked) — drop it from the drill-down.
    await FailedTest.deleteOne({ origin: 'manual', sourceId: executionId });
  }
}

async function handleCycleFinished(payload) {
  const { cycleId, projectId } = payload;

  const report = await CycleReport.findOneAndUpdate(
    { cycleId },
    { $set: { projectId, status: 'closed' } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  function passRate(passed, total) {
    return total > 0 ? passed / total : null;
  }

  const date = new Date();
  const points = [];

  if (report.totalManual > 0) {
    points.push({
      projectId,
      cycleId,
      date,
      origin: 'manual',
      passRate: passRate(report.passedManual, report.totalManual),
    });
  }
  if (report.totalAllure > 0) {
    points.push({
      projectId,
      cycleId,
      date,
      origin: 'allure',
      passRate: passRate(report.passedAllure, report.totalAllure),
    });
  }
  if (report.totalNewman > 0) {
    points.push({
      projectId,
      cycleId,
      date,
      origin: 'newman',
      passRate: passRate(report.passedNewman, report.totalNewman),
    });
  }

  const combinedTotal = report.totalManual + report.totalAllure + report.totalNewman;
  const combinedPassed = report.passedManual + report.passedAllure + report.passedNewman;
  points.push({
    projectId,
    cycleId,
    date,
    origin: 'combined',
    passRate: passRate(combinedPassed, combinedTotal),
  });

  await TrendPoint.insertMany(points);
}

// Individual failing tests aren't in the event (only the aggregate summary
// is) — fetch them once now, at consume time, along with the run's
// rawReportUrl, so the failures drill-down has real data to show. Shared by
// both the cycle-attributed branch and the Etapa 5 postmanSuiteId-attributed
// branch below: same fetch, same upsert, only whichever of
// `cycleId`/`postmanSuiteId` applies differs in the $set.
async function upsertFailingTests({ automationRunId, projectId, tool, cycleId, postmanSuiteId }) {
  try {
    const [run, testResults] = await Promise.all([
      executionClient.getAutomationRun(automationRunId),
      executionClient.getAutomationRunTests(automationRunId),
    ]);
    const rawReportUrl = run ? run.rawReportUrl : null;
    const failing = testResults.filter((t) => t.status === 'failed' || t.status === 'broken');

    await Promise.all(
      failing.map((testResult) =>
        FailedTest.findOneAndUpdate(
          { origin: tool, sourceId: testResult._id },
          {
            $set: {
              cycleId: cycleId || null,
              postmanSuiteId: postmanSuiteId || null,
              projectId,
              origin: tool,
              sourceId: testResult._id,
              testName: testResult.testName,
              suiteName: testResult.suiteName,
              status: testResult.status,
              errorMessage: testResult.errorMessage,
              rawReportUrl,
            },
          },
          { upsert: true },
        ),
      ),
    );
  } catch (err) {
    logger.error('Could not fetch automation run details for failures drill-down', {
      automationRunId,
      error: err.message,
    });
  }
}

// Etapa 5: a live Postman Suite run has no cycleId to attribute a
// CycleReport/TrendPoint to — there's no "cycle" it belongs to, and no
// "Suite finished" event equivalent to handleCycleFinished's cycle-close
// trigger either. Unlike a cycle (which accumulates many executions before
// closing), one AutomationRunIngested *is* already a complete, self-
// contained execution, so it's the point in time a trend point can
// meaningfully represent — one TrendPoint per run, not one per Suite ever.
async function handlePostmanSuiteRunIngested({
  automationRunId,
  projectId,
  postmanSuiteId,
  tool,
  summary,
  executedAt,
}) {
  await upsertFailingTests({ automationRunId, projectId, tool, postmanSuiteId });

  if (summary.total > 0) {
    await TrendPoint.create({
      projectId,
      postmanSuiteId,
      date: executedAt ? new Date(executedAt) : new Date(),
      origin: tool,
      passRate: summary.passed / summary.total,
    });
  }
}

async function handleAutomationRunIngested(payload) {
  const { automationRunId, projectId, cycleId, postmanSuiteId, tool, summary, executedAt } =
    payload;

  await AutomationRunIndex.findOneAndUpdate(
    { _id: automationRunId },
    { $set: { cycleId: cycleId || null, projectId } },
    { upsert: true },
  );

  // Etapa 7 (docs/postman-runner/etapa-7-sistema-de-alertas.md): applies to
  // every run regardless of which branch below it takes (cycleId,
  // postmanSuiteId, or neither) — a manual upload with failures deserves an
  // alert just as much as a live Suite run does, so this sits before the
  // cycleId/postmanSuiteId branching, not inside either branch.
  if (shouldNotify(summary)) {
    await createAutomationRunFailedNotification({
      automationRunId,
      projectId,
      cycleId,
      postmanSuiteId,
      summary,
    });
  }

  if (!cycleId) {
    if (postmanSuiteId) {
      await handlePostmanSuiteRunIngested({
        automationRunId,
        projectId,
        postmanSuiteId,
        tool,
        summary,
        executedAt,
      });
    }
    // Neither cycleId nor postmanSuiteId — nothing to attribute anywhere
    // beyond the AutomationRunIndex upsert above.
    return;
  }

  const inc =
    tool === 'allure'
      ? { totalAllure: summary.total, passedAllure: summary.passed, failedAllure: summary.failed }
      : { totalNewman: summary.total, passedNewman: summary.passed, failedNewman: summary.failed };

  await CycleReport.findOneAndUpdate(
    { cycleId },
    { $set: { projectId }, $inc: inc },
    { upsert: true, setDefaultsOnInsert: true },
  );

  await upsertFailingTests({ automationRunId, projectId, tool, cycleId });
}

function computeOpenDefectsLinked(linkedDefects) {
  return linkedDefects.filter((d) => !['resolved', 'closed'].includes(d.status)).length;
}

async function attachLinkedDefectToFailedTest({
  linkedExecutionId,
  linkedAutomationTestResultId,
  defectId,
  code,
  status,
}) {
  const sourceId = linkedExecutionId || linkedAutomationTestResultId;
  if (!sourceId) return;

  await FailedTest.updateOne({ sourceId }, { $set: { linkedDefect: { defectId, code, status } } });
}

async function handleDefectCreated(payload) {
  const { defectId, code, severity, linkedExecutionId, linkedAutomationTestResultId } = payload;

  const resolved = await resolveCycleIdForDefect({
    linkedExecutionId,
    linkedAutomationTestResultId,
  });
  if (!resolved) {
    logger.info('DefectCreated not linked to any known cycle, skipping report attribution', {
      defectId,
    });
    return;
  }

  const report = await CycleReport.findOneAndUpdate(
    { cycleId: resolved.cycleId },
    {
      $set: { projectId: resolved.projectId },
      $push: { linkedDefects: { defectId, code, severity, status: 'open' } },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  report.openDefectsLinked = computeOpenDefectsLinked(report.linkedDefects);
  await report.save();

  await attachLinkedDefectToFailedTest({
    linkedExecutionId,
    linkedAutomationTestResultId,
    defectId,
    code,
    status: 'open',
  });
}

async function handleDefectStatusChanged(payload) {
  const { defectId, toStatus } = payload;

  const report = await CycleReport.findOneAndUpdate(
    { 'linkedDefects.defectId': defectId },
    { $set: { 'linkedDefects.$.status': toStatus } },
    { returnDocument: 'after' },
  );
  if (!report) return;

  report.openDefectsLinked = computeOpenDefectsLinked(report.linkedDefects);
  await report.save();

  await FailedTest.updateMany(
    { 'linkedDefect.defectId': defectId },
    { $set: { 'linkedDefect.status': toStatus } },
  );
}

const HANDLERS = {
  ExecutionUpdated: handleExecutionUpdated,
  CycleFinished: handleCycleFinished,
  AutomationRunIngested: handleAutomationRunIngested,
  DefectCreated: handleDefectCreated,
  DefectStatusChanged: handleDefectStatusChanged,
};

module.exports = {
  HANDLERS,
  computeOpenDefectsLinked,
  handleExecutionUpdated,
  handleCycleFinished,
  handleAutomationRunIngested,
  handleDefectCreated,
  handleDefectStatusChanged,
};
