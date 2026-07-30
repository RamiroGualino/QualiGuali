import { getToken, notifyUnauthorized } from './authStore';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// One instance per backend service (there's no API Gateway, see config.js).
// Centralizes the JWT header and uniform 401 handling the prompt asks for.
export function createHttpClient(baseUrl) {
  async function request(path, { method = 'GET', body, isFormData = false, params } = {}) {
    const url = new URL(path, baseUrl);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, value);
        }
      });
    }

    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body && !isFormData) headers['Content-Type'] = 'application/json';

    const response = await fetch(url, {
      method,
      headers,
      body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      notifyUnauthorized();
    }

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null;

    if (!response.ok) {
      throw new ApiError(data?.message || response.statusText, response.status, data);
    }

    return data;
  }

  return {
    get: (path, params) => request(path, { method: 'GET', params }),
    post: (path, body) => request(path, { method: 'POST', body }),
    postForm: (path, formData) =>
      request(path, { method: 'POST', body: formData, isFormData: true }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    patchForm: (path, formData) =>
      request(path, { method: 'PATCH', body: formData, isFormData: true }),
    del: (path) => request(path, { method: 'DELETE' }),
  };
}
