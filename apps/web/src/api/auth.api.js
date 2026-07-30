import { createHttpClient } from './httpClient';
import { API_BASE_URLS } from './config';

const client = createHttpClient(API_BASE_URLS.auth);

export const authApi = {
  login: (email, password) => client.post('/auth/login', { email, password }),
  me: () => client.get('/auth/me'),
};
