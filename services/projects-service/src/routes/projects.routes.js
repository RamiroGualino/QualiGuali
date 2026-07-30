const express = require('express');
const { createAuthenticate, requireRole, ROLES } = require('@qualiguali/shared');
const env = require('../config/env');
const projectsController = require('../controllers/projects.controller');
const modulesController = require('../controllers/modules.controller');

const router = express.Router();
const authenticate = createAuthenticate(env.jwtSecret);
// Only Admin/Super Admin manage projects & modules; every authenticated
// role (including QA Engineer) can read them.
const requireManager = requireRole(ROLES.SUPER_ADMIN, ROLES.ADMIN);

router.use(authenticate);

router.post('/', requireManager, projectsController.createProject);
router.get('/', projectsController.listProjects);
router.get('/:projectId', projectsController.getProject);
router.patch('/:projectId', requireManager, projectsController.updateProject);
router.delete('/:projectId', requireManager, projectsController.deleteProject);

router.post('/:projectId/modules', requireManager, modulesController.createModule);
router.get('/:projectId/modules', modulesController.listModules);
router.get('/:projectId/modules/:moduleId', modulesController.getModule);
router.patch('/:projectId/modules/:moduleId', requireManager, modulesController.updateModule);
router.delete('/:projectId/modules/:moduleId', requireManager, modulesController.deleteModule);

module.exports = router;
