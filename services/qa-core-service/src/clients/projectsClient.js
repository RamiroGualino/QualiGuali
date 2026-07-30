const env = require('../config/env');

// projects-service requires a valid JWT on every route (including reads), so
// we forward the caller's own Authorization header rather than minting a
// separate service-to-service credential.
async function requestJson(path, authorization) {
  let response;
  try {
    response = await fetch(`${env.projectsServiceUrl}${path}`, {
      headers: authorization ? { Authorization: authorization } : {},
    });
  } catch (err) {
    const wrapped = new Error(`Failed to reach projects-service: ${err.message}`);
    wrapped.status = 502;
    throw wrapped;
  }

  if (response.status === 404) return null;

  if (!response.ok) {
    const err = new Error(`projects-service responded with ${response.status}`);
    err.status = 502;
    throw err;
  }

  return response.json();
}

async function getProject(projectId, authorization) {
  const body = await requestJson(`/projects/${projectId}`, authorization);
  return body ? body.project : null;
}

async function getModule(projectId, moduleId, authorization) {
  const body = await requestJson(`/projects/${projectId}/modules/${moduleId}`, authorization);
  return body ? body.module : null;
}

module.exports = { getProject, getModule };
