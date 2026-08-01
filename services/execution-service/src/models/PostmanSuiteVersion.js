const mongoose = require('mongoose');

// Append-only history of every collection/environment upload for a
// PostmanSuite — lets a past run be traced back to (or re-executed against)
// the exact files that produced it, even after the Suite has since moved on
// to a newer version. Never updated in place, only inserted.
const postmanSuiteVersionSchema = new mongoose.Schema(
  {
    suiteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PostmanSuite',
      required: true,
      index: true,
    },
    collectionFileUrl: { type: String, required: true },
    // null when this particular version bump didn't include a new
    // environment file (the Suite kept using whatever environment version
    // was already active).
    environmentFileUrl: { type: String, default: null },
    version: { type: Number, required: true, min: 1 },
    createdBy: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

postmanSuiteVersionSchema.index({ suiteId: 1, version: -1 });

module.exports = mongoose.model(
  'PostmanSuiteVersion',
  postmanSuiteVersionSchema,
  'execution_postmanSuiteVersions',
);
