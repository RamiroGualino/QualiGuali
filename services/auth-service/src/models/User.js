const mongoose = require('mongoose');
const { ROLE_VALUES } = require('@qualiguali/shared');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ROLE_VALUES,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // IDs of projects-service Projects this user is associated with.
    // Informational/organizational only for now — does not restrict what
    // this user can see or do elsewhere in the app.
    assignedProjectIds: {
      type: [String],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

// Explicit collection name (3rd arg) per the shared-database naming
// convention: every collection is prefixed with its owning service.
module.exports = mongoose.model('User', userSchema, 'auth_users');
