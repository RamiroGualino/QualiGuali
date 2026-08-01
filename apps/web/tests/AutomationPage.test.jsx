import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import i18n from '../src/i18n';
import { AutomationPage } from '../src/pages/AutomationPage';
import { automationRunsApi, executionCyclesApi, postmanSuitesApi } from '../src/api/execution.api';
import { requirementsApi } from '../src/api/qaCore.api';

vi.mock('../src/api/execution.api', () => ({
  automationRunsApi: { list: vi.fn(), listTests: vi.fn(), upload: vi.fn() },
  executionCyclesApi: { list: vi.fn() },
  postmanSuitesApi: { list: vi.fn() },
}));

vi.mock('../src/api/qaCore.api', () => ({
  requirementsApi: { list: vi.fn() },
}));

beforeAll(() => i18n.changeLanguage('en'));

beforeEach(() => {
  vi.clearAllMocks();
  executionCyclesApi.list.mockResolvedValue({ executionCycles: [] });
  postmanSuitesApi.list.mockResolvedValue({
    postmanSuites: [{ _id: 'suite-1', name: 'Smoke API', environmentFileUrl: null, requirementId: 'req-1' }],
  });
  requirementsApi.list.mockResolvedValue({ requirements: [{ _id: 'req-1', code: 'REQ-1', title: 'Login flow' }] });
});

function renderApiTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/proj-1/automation/api']}>
        <Routes>
          <Route path="/projects/:projectId/automation/api" element={<AutomationPage />} />
          <Route path="/projects/:projectId/automation/runs/:runId" element={<p>run detail</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const passingRun = {
  _id: 'run-1',
  tool: 'newman',
  postmanSuiteId: 'suite-1',
  executedAt: '2026-01-01T09:00:00.000Z',
  totalTests: 3,
  passed: 3,
  failed: 0,
  broken: 0,
  skipped: 0,
  rawReportUrl: 'http://minio.local/report-1.json',
};

const failingRun = {
  _id: 'run-2',
  tool: 'newman',
  postmanSuiteId: null,
  executedAt: '2026-01-02T09:00:00.000Z',
  totalTests: 2,
  passed: 0,
  failed: 2,
  broken: 0,
  skipped: 0,
  rawReportUrl: 'http://minio.local/report-2.json',
};

describe('AutomationPage — API tab table', () => {
  test('shows Suite Ejecutada, Fecha y Hora, Entorno and Estado/Resultados instead of the old flat columns', async () => {
    automationRunsApi.list.mockResolvedValue({ automationRuns: [passingRun] });

    renderApiTab();

    // getByRole('cell', ...) rather than getByText — "Smoke API" also
    // appears as an <option> in the new Suite filter Select above the
    // table.
    expect(await screen.findByRole('cell', { name: 'Smoke API' })).toBeInTheDocument();
    expect(screen.getByText('Executed Suite')).toBeInTheDocument();
    expect(screen.getByText('Date & Time')).toBeInTheDocument();
    expect(screen.getByText('Status / Results')).toBeInTheDocument();
    // The old plain "Tool" column is gone from this tab.
    expect(screen.queryByText('Tool')).not.toBeInTheDocument();
  });

  test('falls back to "Manual upload" for a run with no postmanSuiteId', async () => {
    automationRunsApi.list.mockResolvedValue({ automationRuns: [failingRun] });

    renderApiTab();

    expect(await screen.findByText('Manual upload')).toBeInTheDocument();
  });

  test('a single primary "View Report" button navigates to the run detail page', async () => {
    automationRunsApi.list.mockResolvedValue({ automationRuns: [passingRun] });
    const user = userEvent.setup();

    renderApiTab();

    const button = await screen.findByRole('button', { name: 'View Report' });
    await user.click(button);

    expect(await screen.findByText('run detail')).toBeInTheDocument();
  });

  test('secondary actions live behind the ⋮ menu, not as loose buttons/links', async () => {
    automationRunsApi.list.mockResolvedValue({ automationRuns: [passingRun] });
    automationRunsApi.listTests.mockResolvedValue({ testResults: [] });
    const user = userEvent.setup();

    renderApiTab();

    await screen.findByRole('cell', { name: 'Smoke API' });
    expect(screen.queryByText('View failures')).not.toBeInTheDocument();
    expect(screen.queryByText('Download raw JSON')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Actions' }));

    expect(screen.getByText('View failures')).toBeInTheDocument();
    expect(screen.getByText('Download raw JSON')).toBeInTheDocument();
  });

  test('a run with failures gets the failed row highlight', async () => {
    automationRunsApi.list.mockResolvedValue({ automationRuns: [failingRun] });

    renderApiTab();

    const row = (await screen.findByText('Manual upload')).closest('tr');
    expect(row.className).toMatch(/rowFailed/);
  });

  test('a fully passing run gets the passed row highlight', async () => {
    automationRunsApi.list.mockResolvedValue({ automationRuns: [passingRun] });

    renderApiTab();

    const row = (await screen.findByRole('cell', { name: 'Smoke API' })).closest('tr');
    expect(row.className).toMatch(/rowPassed/);
  });
});

describe('AutomationPage — API tab filters', () => {
  test('filtering by Suite hides runs from other suites (and manual uploads)', async () => {
    automationRunsApi.list.mockResolvedValue({ automationRuns: [passingRun, failingRun] });
    const user = userEvent.setup();

    renderApiTab();
    await screen.findByRole('cell', { name: 'Smoke API' });
    expect(screen.getByRole('cell', { name: 'Manual upload' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Suite'), 'suite-1');

    expect(screen.getByRole('cell', { name: 'Smoke API' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Manual upload' })).not.toBeInTheDocument();
  });

  test('filtering by Requirement hides runs whose Suite belongs to a different one', async () => {
    postmanSuitesApi.list.mockResolvedValue({
      postmanSuites: [
        { _id: 'suite-1', name: 'Smoke API', environmentFileUrl: null, requirementId: 'req-1' },
        { _id: 'suite-2', name: 'Other Suite', environmentFileUrl: null, requirementId: 'req-2' },
      ],
    });
    requirementsApi.list.mockResolvedValue({
      requirements: [
        { _id: 'req-1', code: 'REQ-1', title: 'Login flow' },
        { _id: 'req-2', code: 'REQ-2', title: 'Checkout flow' },
      ],
    });
    automationRunsApi.list.mockResolvedValue({
      automationRuns: [passingRun, { ...passingRun, _id: 'run-3', postmanSuiteId: 'suite-2' }],
    });
    const user = userEvent.setup();

    renderApiTab();
    await screen.findByRole('cell', { name: 'Smoke API' });
    expect(screen.getByRole('cell', { name: 'Other Suite' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Requirements'), 'req-1');

    expect(screen.getByRole('cell', { name: 'Smoke API' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Other Suite' })).not.toBeInTheDocument();
  });
});
