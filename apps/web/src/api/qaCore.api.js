import { createHttpClient } from './httpClient';
import { API_BASE_URLS } from './config';

const client = createHttpClient(API_BASE_URLS.qaCore);

export const requirementsApi = {
  list: (projectId, moduleId) => client.get('/requirements', { projectId, moduleId }),
  get: (id) => client.get(`/requirements/${id}`),
  create: (payload) => client.post('/requirements', payload),
  update: (id, patch) => client.patch(`/requirements/${id}`, patch),
  remove: (id) => client.del(`/requirements/${id}`),
  listTestCases: (id) => client.get(`/requirements/${id}/test-cases`),
};

export const testSuitesApi = {
  list: ({ projectId, requirementId } = {}) =>
    client.get('/test-suites', { projectId, requirementId }),
  get: (id) => client.get(`/test-suites/${id}`),
  create: (payload) => client.post('/test-suites', payload),
  update: (id, patch) => client.patch(`/test-suites/${id}`, patch),
  remove: (id) => client.del(`/test-suites/${id}`),
};

export const testCaseTemplatesApi = {
  list: (projectId) => client.get('/test-case-templates', { projectId }),
  create: (payload) => client.post('/test-case-templates', payload),
  update: (id, patch) => client.patch(`/test-case-templates/${id}`, patch),
  remove: (id) => client.del(`/test-case-templates/${id}`),
};

export const testCasesApi = {
  list: ({ projectId, suiteId } = {}) => client.get('/test-cases', { projectId, suiteId }),
  get: (id) => client.get(`/test-cases/${id}`),
  create: (payload) => client.post('/test-cases', payload),
  update: (id, patch) => client.patch(`/test-cases/${id}`, patch),
  remove: (id) => client.del(`/test-cases/${id}`),
};

export const testPlansApi = {
  list: (projectId) => client.get('/test-plans', { projectId }),
  get: (id) => client.get(`/test-plans/${id}`),
  create: (payload) => client.post('/test-plans', payload),
  update: (id, patch) => client.patch(`/test-plans/${id}`, patch),
  remove: (id) => client.del(`/test-plans/${id}`),
  addTestCases: (id, testCaseIds) => client.post(`/test-plans/${id}/test-cases`, { testCaseIds }),
};
