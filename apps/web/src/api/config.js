// No API Gateway yet (Parte 1) — the browser talks to each service's own
// origin directly, matching docker-compose's published ports.
export const API_BASE_URLS = {
  auth: import.meta.env.VITE_AUTH_URL || 'http://localhost:4000',
  projects: import.meta.env.VITE_PROJECTS_URL || 'http://localhost:4001',
  qaCore: import.meta.env.VITE_QA_CORE_URL || 'http://localhost:4002',
  execution: import.meta.env.VITE_EXECUTION_URL || 'http://localhost:4003',
  defects: import.meta.env.VITE_DEFECTS_URL || 'http://localhost:4004',
  reports: import.meta.env.VITE_REPORTS_URL || 'http://localhost:4005',
};
