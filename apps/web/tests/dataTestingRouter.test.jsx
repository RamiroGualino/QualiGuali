import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import i18n from '../src/i18n';
import { AppRouter } from '../src/router';
import { AuthProvider } from '../src/auth/AuthContext';
import { dataTestingApi } from '../src/api/dataTesting.api';
import { projectsApi } from '../src/api/projects.api';
import { notificationsApi } from '../src/api/notifications.api';

// Etapa 9 (docs/data-testing/etapa-9-i18n-navegacion.md): smoke test de que
// las 5 rutas nuevas de Test de Datos están bien conectadas en router.jsx
// (import correcto, componente correcto, no un typo en el path) — no hay
// lógica de negocio nueva en esta etapa, así que no se pide más que esto.
// Recorre el mismo árbol real que un usuario logueado vería (AuthProvider +
// AppShell + Sidebar + Topbar), mockeando sólo lo que esas capas fijas
// necesitan (proyectos para ProjectSwitcher, notificaciones para
// NotificationBell) además de la API del propio módulo.
vi.mock('../src/api/projects.api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, projectsApi: { ...actual.projectsApi, list: vi.fn() } };
});

vi.mock('../src/api/notifications.api', () => ({
  notificationsApi: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}));

vi.mock('../src/api/dataTesting.api', () => ({
  dataTestingApi: {
    listSuites: vi.fn(),
    getSuite: vi.fn(),
    createSuite: vi.fn(),
    updateSuite: vi.fn(),
    deleteSuite: vi.fn(),
    detectColumns: vi.fn(),
    previewMatch: vi.fn(),
    listRuns: vi.fn(),
    getRun: vi.fn(),
    createRun: vi.fn(),
  },
}));

beforeAll(() => i18n.changeLanguage('en'));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem(
    'qualiguali.session',
    JSON.stringify({ token: 'test-token', user: { _id: 'user-1', name: 'Ana', role: 'qa_engineer' } }),
  );
  projectsApi.list.mockResolvedValue({ projects: [] });
  notificationsApi.list.mockResolvedValue({ notifications: [], unreadCount: 0 });
  dataTestingApi.listSuites.mockResolvedValue({ expectationSuites: [] });
  dataTestingApi.listRuns.mockResolvedValue({ validationRuns: [] });
  dataTestingApi.getSuite.mockResolvedValue({
    expectationSuite: { _id: 'suite-1', name: 'Suite de Afiliados', expectations: [], expectedColumns: [] },
  });
  dataTestingApi.getRun.mockResolvedValue({
    validationRun: {
      _id: 'run-1',
      suiteId: 'suite-1',
      datasetName: 'afiliados.xlsx',
      executedAt: '2026-07-01T10:00:00.000Z',
      overallStatus: 'passed',
      columnCoverage: [],
      results: [],
    },
  });
});

function renderAt(path) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('data-testing routes', () => {
  test('/projects/:projectId/data-testing/suites renders ExpectationSuitesPage', async () => {
    renderAt('/projects/proj-1/data-testing/suites');
    expect(await screen.findByText('Expectation Suites')).toBeInTheDocument();
  });

  test('/projects/:projectId/data-testing/suites/new renders ExpectationSuiteFormPage', async () => {
    renderAt('/projects/proj-1/data-testing/suites/new');
    expect(await screen.findByText('Create Expectation Suite')).toBeInTheDocument();
  });

  test('/projects/:projectId/data-testing/suites/:id renders ExpectationSuiteFormPage in edit mode', async () => {
    renderAt('/projects/proj-1/data-testing/suites/suite-1');
    expect(await screen.findByText('Edit Expectation Suite')).toBeInTheDocument();
  });

  test('/projects/:projectId/data-testing/runs renders ExpectationRunsPage', async () => {
    renderAt('/projects/proj-1/data-testing/runs');
    expect(await screen.findByText('Validation Runs')).toBeInTheDocument();
  });

  test('/projects/:projectId/data-testing/runs/:runId renders ExpectationRunDetailPage', async () => {
    renderAt('/projects/proj-1/data-testing/runs/run-1');
    expect(await screen.findByText('Run Detail')).toBeInTheDocument();
  });
});
