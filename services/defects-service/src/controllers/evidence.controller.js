const mongoose = require('mongoose');
const Defect = require('../models/Defect');
const DefectEvidence = require('../models/DefectEvidence');
const s3Client = require('../clients/s3Client');

const VALID_FILE_TYPES = ['image', 'video', 'log'];

function inferFileType(mimetype = '') {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'log';
}

function notFound(res) {
  return res.status(404).json({ message: 'Defect not found' });
}

async function uploadEvidence(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    // Evidence can only be attached to a Defect that already exists — never
    // orphaned.
    const defect = await Defect.findById(req.params.id);
    if (!defect) return notFound(res);

    if (!req.file) {
      return res.status(400).json({ message: 'A file is required (multipart field name: "file")' });
    }

    const fileType = req.body.fileType || inferFileType(req.file.mimetype);
    if (!VALID_FILE_TYPES.includes(fileType)) {
      return res.status(400).json({
        message: `fileType must be one of: ${VALID_FILE_TYPES.join(', ')}`,
      });
    }

    const key = `defects/${defect._id}/${Date.now()}-${req.file.originalname}`;
    const fileUrl = await s3Client.uploadObject(key, req.file.buffer, req.file.mimetype);

    const evidence = await DefectEvidence.create({
      defectId: defect._id,
      fileUrl,
      fileType,
    });

    return res.status(201).json({ evidence });
  } catch (err) {
    return next(err);
  }
}

async function listEvidence(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return notFound(res);

    const defect = await Defect.findById(req.params.id);
    if (!defect) return notFound(res);

    const evidence = await DefectEvidence.find({ defectId: defect._id }).sort({ uploadedAt: 1 });
    return res.status(200).json({ evidence });
  } catch (err) {
    return next(err);
  }
}

module.exports = { uploadEvidence, listEvidence };
