import { createHttpClient } from './httpClient';
import { API_BASE_URLS } from './config';

const client = createHttpClient(API_BASE_URLS.execution);

export const executionCyclesApi = {
  list: (projectId) => client.get('/execution-cycles', { projectId }),
  get: (id) => client.get(`/execution-cycles/${id}`),
  create: (payload) => client.post('/execution-cycles', payload),
  update: (id, patch) => client.patch(`/execution-cycles/${id}`, patch),
  remove: (id) => client.del(`/execution-cycles/${id}`),
  close: (id, force) => client.post(`/execution-cycles/${id}/close`, { force }),
  duplicate: (id) => client.post(`/execution-cycles/${id}/duplicate`),
  listExecutions: (id) => client.get(`/execution-cycles/${id}/executions`),
};

export const executionsApi = {
  update: (id, payload) => client.patch(`/executions/${id}`, payload),
  listHistory: (id) => client.get(`/executions/${id}/history`),
  deleteHistoryEntry: (id, historyId) => client.del(`/executions/${id}/history/${historyId}`),
  listEvidence: (id) => client.get(`/executions/${id}/evidence`),
  // executionHistoryId: opt-in — names exactly which past attempt this
  // photo belongs to (adding another one to a non-latest attempt from the
  // history list); omit it and the backend claims whichever attempt is
  // current right now.
  uploadEvidence: (id, file, fileType, executionHistoryId) => {
    const formData = new FormData();
    formData.append('file', file);
    if (fileType) formData.append('fileType', fileType);
    if (executionHistoryId) formData.append('executionHistoryId', executionHistoryId);
    return client.postForm(`/executions/${id}/evidence`, formData);
  },
  updateEvidence: (id, evidenceId, file, fileType) => {
    const formData = new FormData();
    formData.append('file', file);
    if (fileType) formData.append('fileType', fileType);
    return client.patchForm(`/executions/${id}/evidence/${evidenceId}`, formData);
  },
  deleteEvidence: (id, evidenceId) => client.del(`/executions/${id}/evidence/${evidenceId}`),
};

export const automationRunsApi = {
  list: (params) => client.get('/execution/automation-runs', params),
  get: (id) => client.get(`/execution/automation-runs/${id}`),
  listTests: (id, status) => client.get(`/execution/automation-runs/${id}/tests`, { status }),
  upload: (files, { projectId, cycleId, tool }) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));
    formData.append('projectId', projectId);
    if (cycleId) formData.append('cycleId', cycleId);
    if (tool) formData.append('tool', tool);
    return client.postForm('/execution/automation-runs', formData);
  },
};
