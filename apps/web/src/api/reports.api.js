import { createHttpClient } from './httpClient';
import { API_BASE_URLS } from './config';

const client = createHttpClient(API_BASE_URLS.reports);

export const reportsApi = {
  getCycleReport: (cycleId) => client.get(`/reports/cycles/${cycleId}`),
  getCycleFailures: (cycleId, params) => client.get(`/reports/cycles/${cycleId}/failures`, params),
  getProjectTrend: (projectId, params) =>
    client.get(`/reports/projects/${projectId}/trend`, params),
};
