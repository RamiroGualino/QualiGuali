import { createHttpClient } from './httpClient';
import { API_BASE_URLS } from './config';

const client = createHttpClient(API_BASE_URLS.dataTesting);

// Etapa 6 (docs/data-testing/etapa-6-frontend-suites.md): cliente HTTP del
// módulo Test de Datos, mismo patrón que defects.api.js/execution.api.js —
// funciones finas 1:1 sobre los endpoints reales de data-testing-service
// (Etapas 4 y 5). listRuns/getRun/createRun se usan recién en la Etapa 7,
// pero viven acá junto al resto del cliente del mismo servicio.
export const dataTestingApi = {
  listSuites: (params) => client.get('/suites', params),
  getSuite: (id) => client.get(`/suites/${id}`),
  createSuite: (payload) => client.post('/suites', payload),
  updateSuite: (id, patch) => client.patch(`/suites/${id}`, patch),
  deleteSuite: (id) => client.del(`/suites/${id}`),
  detectColumns: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.postForm('/suites/detect-columns', formData);
  },
  previewMatch: (suiteId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return client.postForm(`/suites/${suiteId}/preview-match`, formData);
  },
  listRuns: (params) => client.get('/validation-runs', params),
  getRun: (id) => client.get(`/validation-runs/${id}`),
  createRun: ({ suiteId, file, columnMappingOverrides, saveMappingToSuite }) => {
    const formData = new FormData();
    formData.append('suiteId', suiteId);
    formData.append('file', file);
    if (columnMappingOverrides) {
      formData.append('columnMappingOverrides', JSON.stringify(columnMappingOverrides));
    }
    if (saveMappingToSuite) formData.append('saveMappingToSuite', 'true');
    return client.postForm('/validation-runs', formData);
  },
};
