const mongoose = require('mongoose');

const defectEvidenceSchema = new mongoose.Schema({
  defectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Defect',
    required: true,
    index: true,
  },
  fileUrl: { type: String, required: true },
  fileType: { type: String, enum: ['image', 'video', 'log'], required: true },
  uploadedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('DefectEvidence', defectEvidenceSchema, 'defects_evidence');
