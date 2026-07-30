import { createHttpClient } from './httpClient';
import { API_BASE_URLS } from './config';

const client = createHttpClient(API_BASE_URLS.auth);

export const usersApi = {
  list: () => client.get('/users'),
  create: (payload) => client.post('/users', payload),
  update: (userId, patch) => client.patch(`/users/${userId}`, patch),
  remove: (userId) => client.del(`/users/${userId}`),
};
