import { createHttpClient } from './httpClient';
import { API_BASE_URLS } from './config';

const client = createHttpClient(API_BASE_URLS.projects);

export const projectsApi = {
  list: () => client.get('/projects'),
  get: (projectId) => client.get(`/projects/${projectId}`),
  create: (payload) => client.post('/projects', payload),
  update: (projectId, patch) => client.patch(`/projects/${projectId}`, patch),
  remove: (projectId) => client.del(`/projects/${projectId}`),
};

export const modulesApi = {
  list: (projectId) => client.get(`/projects/${projectId}/modules`),
  get: (projectId, moduleId) => client.get(`/projects/${projectId}/modules/${moduleId}`),
  create: (projectId, payload) => client.post(`/projects/${projectId}/modules`, payload),
  update: (projectId, moduleId, patch) =>
    client.patch(`/projects/${projectId}/modules/${moduleId}`, patch),
  remove: (projectId, moduleId) => client.del(`/projects/${projectId}/modules/${moduleId}`),
};
