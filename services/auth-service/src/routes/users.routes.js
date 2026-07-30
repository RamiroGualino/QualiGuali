const express = require('express');
const { createAuthenticate, requireRole, ROLES } = require('@qualiguali/shared');
const env = require('../config/env');
const controller = require('../controllers/users.controller');

const router = express.Router();
const authenticate = createAuthenticate(env.jwtSecret);
// Only a Super Admin manages users (create/edit/delete/assign) — same rule
// /auth/register already enforces for user creation.
const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);

router.use(authenticate, requireSuperAdmin);

router.get('/', controller.listUsers);
router.post('/', controller.createUser);
router.patch('/:userId', controller.updateUser);
router.delete('/:userId', controller.deleteUser);

module.exports = router;
