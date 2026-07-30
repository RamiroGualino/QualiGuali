const env = require('../config/env');

// projects-service requires a valid JWT on every route (including reads), so
// we forward the caller's own Authorization header rather than minting a
// separate service-to-service credential — same pattern qa-core-service's
// projectsClient uses to validate a projectId.
async function projectExists(projectId, authorization) {
  let response;
  try {
    response = await fetch(`${env.projectsServiceUrl}/projects/${projectId}`, {
      headers: authorization ? { Authorization: authorization } : {},
    });
  } catch (err) {
    const wrapped = new Error(`Failed to reach projects-service: ${err.message}`);
    wrapped.status = 502;
    throw wrapped;
  }

  if (response.status === 404) return false;

  if (!response.ok) {
    const err = new Error(`projects-service responded with ${response.status}`);
    err.status = 502;
    throw err;
  }

  return true;
}

async function validateProjectIds(projectIds, authorization) {
  const uniqueIds = [...new Set(projectIds)];
  for (const projectId of uniqueIds) {
    const exists = await projectExists(projectId, authorization);
    if (!exists) {
      const err = new Error(`Project "${projectId}" does not exist`);
      err.status = 400;
      throw err;
    }
  }
}

module.exports = { validateProjectIds };
