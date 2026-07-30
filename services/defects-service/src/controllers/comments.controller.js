const mongoose = require('mongoose');
const Defect = require('../models/Defect');
const DefectComment = require('../models/DefectComment');

function defectNotFound(res) {
  return res.status(404).json({ message: 'Defect not found' });
}

async function createComment(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return defectNotFound(res);

    const defect = await Defect.findById(req.params.id);
    if (!defect) return defectNotFound(res);

    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ message: 'text is required' });
    }

    const comment = await DefectComment.create({
      defectId: defect._id,
      authorId: req.auth.userId,
      text,
    });

    return res.status(201).json({ comment });
  } catch (err) {
    return next(err);
  }
}

async function listComments(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return defectNotFound(res);

    const defect = await Defect.findById(req.params.id);
    if (!defect) return defectNotFound(res);

    const comments = await DefectComment.find({ defectId: defect._id }).sort({ createdAt: 1 });
    return res.status(200).json({ comments });
  } catch (err) {
    return next(err);
  }
}

module.exports = { createComment, listComments };
