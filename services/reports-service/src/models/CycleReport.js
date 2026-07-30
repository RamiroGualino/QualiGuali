const mongoose = require('mongoose');

// Denormalized so the dashboard never depends on defects-service being up
// at read time (see README "Desnormalización de defectos"): code/severity
// come from DefectCreated's payload, status is kept in sync from
// DefectStatusChanged.
const linkedDefectSchema = new mongoose.Schema(
  {
    defectId: { type: String, required: true },
    code: { type: String, required: true },
    severity: { type: String, required: true },
    status: { type: String, required: true },
  },
  { _id: false },
);

const cycleReportSchema = new mongoose.Schema(
  {
    cycleId: { type: String, required: true, unique: true },
    projectId: { type: String, required: true, index: true },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    totalManual: { type: Number, default: 0, min: 0 },
    passedManual: { type: Number, default: 0, min: 0 },
    failedManual: { type: Number, default: 0, min: 0 },
    totalAllure: { type: Number, default: 0, min: 0 },
    passedAllure: { type: Number, default: 0, min: 0 },
    failedAllure: { type: Number, default: 0, min: 0 },
    totalNewman: { type: Number, default: 0, min: 0 },
    passedNewman: { type: Number, default: 0, min: 0 },
    failedNewman: { type: Number, default: 0, min: 0 },
    openDefectsLinked: { type: Number, default: 0, min: 0 },
    linkedDefects: { type: [linkedDefectSchema], default: [] },
  },
  // The ERD (Arquitectura v1.1 §10 / v1.2) only lists `updatedAt` for
  // CYCLE_REPORT, not `createdAt` — honored literally here.
  { timestamps: { createdAt: false, updatedAt: true } },
);

module.exports = mongoose.model('CycleReport', cycleReportSchema, 'reports_cycleReports');
