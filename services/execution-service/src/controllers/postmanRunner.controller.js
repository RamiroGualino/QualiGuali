const mongoose = require('mongoose');
const { logger } = require('@qualiguali/shared');
const PostmanSuite = require('../models/PostmanSuite');
const { isSuiteRunning } = require('../services/postmanRunner.service');
const { runAndPersistPostmanSuite } = require('../services/postmanSuiteRunOrchestrator.service');

// Etapa 3: triggers a live execution of a PostmanSuite. Fire-and-forget —
// responds 202 as soon as the run has been accepted (per etapa-1's flow:
// "no bloquea el request HTTP"), since a run can legitimately take up to
// suite.timeoutMs. The actual AutomationRun only gets persisted once
// Newman finishes, some time after this request has already completed.
//
// Etapa 4 closed the traceability gap this used to have: the resulting
// AutomationRun now carries postmanSuiteId/triggerType, so it links back to
// the PostmanSuite that produced it instead of showing up indistinguishable
// from any other manually-uploaded Newman run.
async function triggerPostmanSuiteRun(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }
    const suite = await PostmanSuite.findById(req.params.id);
    if (!suite) {
      return res.status(404).json({ message: 'Postman suite not found' });
    }
    if (!suite.isActive) {
      return res.status(400).json({ message: 'Postman suite is not active' });
    }

    // Best-effort pre-check so a request for an already-running suite gets
    // a real 409 instead of a 202 that quietly turns into a no-op later.
    // The actual guard is the synchronous check at the top of runSuite()
    // itself (a single in-process Set, per etapa-3's concurrency design,
    // not a distributed lock) — two requests landing in the exact same
    // event-loop tick could both pass this pre-check before either's
    // runSuite() call claims the suite. Accepted narrow race for this MVP
    // (single-user-triggered manual action, not a public high-concurrency
    // API); revisit if/when Etapa 6's scheduler makes that more likely.
    if (isSuiteRunning(suite._id)) {
      return res.status(409).json({ message: `Postman suite "${suite._id}" is already running` });
    }

    res.status(202).json({ status: 'running', postmanSuiteId: suite._id.toString() });

    const triggeredBy = req.auth.userId;
    runAndPersistPostmanSuite(suite, { triggerType: 'manual', triggeredBy }).catch((err) => {
      logger.error('Unexpected error running Postman suite', {
        postmanSuiteId: suite._id.toString(),
        error: err.message,
      });
    });

    return undefined;
  } catch (err) {
    return next(err);
  }
}

module.exports = { triggerPostmanSuiteRun };
