const User = require('../models/User');
const { hashPassword } = require('../utils/password');
const { canRegister, REGISTERABLE_ROLES } = require('../utils/permissions');
const { validateProjectIds } = require('../clients/projectsClient');

// Mirrors authorizeRegistration's rule for /auth/register: only a Super
// Admin can manage users, and only into the Admin/QA Engineer roles — there
// is no endpoint that creates, edits, or removes another Super Admin.
function assertManageableRole(role) {
  if (!REGISTERABLE_ROLES.includes(role)) {
    const err = new Error(
      `Role "${role}" cannot be managed here. Allowed roles: ${REGISTERABLE_ROLES.join(', ')}`,
    );
    err.status = 400;
    throw err;
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    return res.status(200).json({ users });
  } catch (err) {
    return next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { name, email, password, role, assignedProjectIds = [] } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }
    if (!canRegister(req.auth.role, role)) {
      return res.status(403).json({
        message: `Role "${req.auth.role}" cannot create a user with role "${role}". Allowed target roles: ${REGISTERABLE_ROLES.join(', ')}`,
      });
    }

    if (assignedProjectIds.length > 0) {
      await validateProjectIds(assignedProjectIds, req.headers.authorization);
    }

    const passwordHash = await hashPassword(password);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      role,
      assignedProjectIds,
    });

    return res.status(201).json({ user: user.toJSON() });
  } catch (err) {
    return next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }
    assertManageableRole(target.role);

    const { name, role, isActive, assignedProjectIds } = req.body;

    if (role !== undefined) assertManageableRole(role);
    if (assignedProjectIds !== undefined && assignedProjectIds.length > 0) {
      await validateProjectIds(assignedProjectIds, req.headers.authorization);
    }

    if (name !== undefined) target.name = name;
    if (role !== undefined) target.role = role;
    if (isActive !== undefined) target.isActive = isActive;
    if (assignedProjectIds !== undefined) target.assignedProjectIds = assignedProjectIds;

    await target.save();
    return res.status(200).json({ user: target.toJSON() });
  } catch (err) {
    return next(err);
  }
}

// Soft delete: same isActive=false gate already used by login (see
// auth.controller.js) — avoids orphaning any `assignedTo`-style reference
// another service might hold on this user's id.
async function deleteUser(req, res, next) {
  try {
    const target = await User.findById(req.params.userId);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }
    assertManageableRole(target.role);

    target.isActive = false;
    await target.save();

    return res.status(200).json({ user: target.toJSON() });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listUsers, createUser, updateUser, deleteUser };
