const projectsClient = require('../clients/projectsClient');

async function assertProjectAndModule(authorization, projectId, moduleId) {
  const project = await projectsClient.getProject(projectId, authorization);
  if (!project) {
    const err = new Error(`Project "${projectId}" not found`);
    err.status = 400;
    throw err;
  }

  if (moduleId) {
    const moduleDoc = await projectsClient.getModule(projectId, moduleId, authorization);
    if (!moduleDoc) {
      const err = new Error(`Module "${moduleId}" not found in project "${projectId}"`);
      err.status = 400;
      throw err;
    }
  }
}

module.exports = { assertProjectAndModule };
