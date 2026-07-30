const mongoose = require('mongoose');
const Execution = require('../models/Execution');
const ExecutionHistory = require('../models/ExecutionHistory');
const Evidence = require('../models/Evidence');
const s3Client = require('../clients/s3Client');

const VALID_FILE_TYPES = ['image', 'video', 'log'];

function inferFileType(mimetype = '') {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'log';
}

async function uploadEvidence(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Execution not found' });
    }

    // Evidence can only be attached to an Execution that already exists —
    // never orphaned.
    const execution = await Execution.findById(req.params.id);
    if (!execution) {
      return res.status(404).json({ message: 'Execution not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'A file is required (multipart field name: "file")' });
    }

    const fileType = req.body.fileType || inferFileType(req.file.mimetype);
    if (!VALID_FILE_TYPES.includes(fileType)) {
      return res.status(400).json({
        message: `fileType must be one of: ${VALID_FILE_TYPES.join(', ')}`,
      });
    }

    // A caller can name exactly which attempt this evidence belongs to
    // (adding another photo to a past, non-latest attempt from the history
    // list) — validated against this same execution so one case's evidence
    // can't be pinned to another's history row. Without one, it falls back
    // to whichever attempt is current right now: a tester adding a
    // screenshot to a case that's already been marked (documenting it
    // after the fact) expects it to land on that existing result, not
    // float as "unassociated" until some future attempt. Stays null for a
    // case's very first attempt, since there's nothing to claim it yet;
    // updateExecutionResult claims it there the moment that first result
    // is actually submitted.
    let executionHistoryId = null;
    if (req.body.executionHistoryId) {
      if (!mongoose.isValidObjectId(req.body.executionHistoryId)) {
        return res.status(400).json({ message: 'Invalid executionHistoryId' });
      }
      const targetEntry = await ExecutionHistory.findOne({
        _id: req.body.executionHistoryId,
        executionId: execution._id,
      });
      if (!targetEntry) {
        return res.status(400).json({
          message: 'executionHistoryId does not belong to this execution',
        });
      }
      executionHistoryId = targetEntry._id;
    } else {
      const latestHistory = await ExecutionHistory.findOne({ executionId: execution._id }).sort({
        executedAt: -1,
      });
      executionHistoryId = latestHistory?._id || null;
    }

    const key = `executions/${execution._id}/${Date.now()}-${req.file.originalname}`;
    const fileUrl = await s3Client.uploadObject(key, req.file.buffer, req.file.mimetype);

    const evidence = await Evidence.create({
      executionId: execution._id,
      executionHistoryId,
      fileUrl,
      fileType,
    });

    return res.status(201).json({ evidence });
  } catch (err) {
    return next(err);
  }
}

// Replaces an already-uploaded evidence file in place (e.g. re-annotating a
// screenshot after the fact) — same Evidence document, same
// executionHistoryId association, just a new fileUrl/fileType. Not a new
// row, so it doesn't need to go through the "unassociated until claimed"
// dance uploadEvidence does.
async function updateEvidence(req, res, next) {
  try {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !mongoose.isValidObjectId(req.params.evidenceId)
    ) {
      return res.status(404).json({ message: 'Evidence not found' });
    }

    const evidence = await Evidence.findOne({
      _id: req.params.evidenceId,
      executionId: req.params.id,
    });
    if (!evidence) {
      return res.status(404).json({ message: 'Evidence not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'A file is required (multipart field name: "file")' });
    }

    const fileType = req.body.fileType || inferFileType(req.file.mimetype);
    if (!VALID_FILE_TYPES.includes(fileType)) {
      return res.status(400).json({
        message: `fileType must be one of: ${VALID_FILE_TYPES.join(', ')}`,
      });
    }

    const key = `executions/${req.params.id}/${Date.now()}-${req.file.originalname}`;
    const fileUrl = await s3Client.uploadObject(key, req.file.buffer, req.file.mimetype);

    evidence.fileUrl = fileUrl;
    evidence.fileType = fileType;
    await evidence.save();

    return res.status(200).json({ evidence });
  } catch (err) {
    return next(err);
  }
}

async function listEvidence(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Execution not found' });
    }

    const execution = await Execution.findById(req.params.id);
    if (!execution) {
      return res.status(404).json({ message: 'Execution not found' });
    }

    const evidence = await Evidence.find({ executionId: execution._id }).sort({ uploadedAt: 1 });
    return res.status(200).json({ evidence });
  } catch (err) {
    return next(err);
  }
}

// Removing one image from an attempt that already has several — unlike
// deleteExecutionHistoryEntry, this never touches the Execution or
// ExecutionHistory doc, since which photos are attached doesn't affect a
// case's recorded status.
async function deleteEvidence(req, res, next) {
  try {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !mongoose.isValidObjectId(req.params.evidenceId)
    ) {
      return res.status(404).json({ message: 'Evidence not found' });
    }

    const evidence = await Evidence.findOne({
      _id: req.params.evidenceId,
      executionId: req.params.id,
    });
    if (!evidence) {
      return res.status(404).json({ message: 'Evidence not found' });
    }

    await Evidence.deleteOne({ _id: evidence._id });

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

module.exports = { uploadEvidence, updateEvidence, listEvidence, deleteEvidence };
