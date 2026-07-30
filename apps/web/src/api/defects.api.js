import { createHttpClient } from './httpClient';
import { API_BASE_URLS } from './config';

const client = createHttpClient(API_BASE_URLS.defects);

export const defectsApi = {
  list: (params) => client.get('/defects', params),
  get: (id) => client.get(`/defects/${id}`),
  create: (payload) => client.post('/defects', payload),
  update: (id, patch) => client.patch(`/defects/${id}`, patch),
  updateStatus: (id, status) => client.patch(`/defects/${id}/status`, { status }),
  remove: (id) => client.del(`/defects/${id}`),
  listComments: (id) => client.get(`/defects/${id}/comments`),
  addComment: (id, text) => client.post(`/defects/${id}/comments`, { text }),
  listEvidence: (id) => client.get(`/defects/${id}/evidence`),
  uploadEvidence: (id, file, fileType) => {
    const formData = new FormData();
    formData.append('file', file);
    if (fileType) formData.append('fileType', fileType);
    return client.postForm(`/defects/${id}/evidence`, formData);
  },
};
