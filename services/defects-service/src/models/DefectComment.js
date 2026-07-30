const mongoose = require('mongoose');

const defectCommentSchema = new mongoose.Schema(
  {
    defectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Defect',
      required: true,
      index: true,
    },
    authorId: { type: String, required: true },
    text: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

module.exports = mongoose.model('DefectComment', defectCommentSchema, 'defects_defectComments');
