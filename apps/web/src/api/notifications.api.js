import { createHttpClient } from './httpClient';
import { API_BASE_URLS } from './config';

const client = createHttpClient(API_BASE_URLS.reports);

export const notificationsApi = {
  list: (params) => client.get('/notifications', params),
  markRead: (id) => client.patch(`/notifications/${id}/read`, {}),
  markAllRead: (projectId) => client.post('/notifications/mark-all-read', { projectId }),
};
