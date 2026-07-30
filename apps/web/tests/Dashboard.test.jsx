import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import i18n from '../src/i18n';
import { ReportsDashboardPage } from '../src/pages/ReportsDashboardPage';
import { reportsApi } from '../src/api/reports.api';
import { executionCyclesApi } from '../src/api/execution.api';

vi.mock('../src/api/reports.api', () => ({
  reportsApi: {
    getCycleReport: vi.fn(),
    getCycleFailures: vi.fn(),
    getProjectTrend: vi.fn(),
  },
}));

vi.mock('../src/api/execution.api', () => ({
  executionCyclesApi: { list: vi.fn() },
  executionsApi: {},
  automationRunsApi: {},
}));

beforeAll(() => i18n.changeLanguage('en'));

beforeEach(() => {
  vi.clearAllMocks();
  executionCyclesApi.list.mockResolvedValue({ executionCycles: [] });
  reportsApi.getCycleFailures.mockResolvedValue({ failures: [] });
  reportsApi.getProjectTrend.mockResolvedValue({ trend: [] });
});

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/proj-1/reports/cycle-1']}>
        <Routes>
          <Route path="/projects/:projectId/reports/:cycleId" element={<ReportsDashboardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const baseReport = {
  totalManual: 4,
  passedManual: 3,
  failedManual: 1,
  totalAllure: 2,
  passedAllure: 2,
  failedAllure: 0,
  totalNewman: 0,
  passedNewman: 0,
  failedNewman: 0,
  openDefectsLinked: 1,
};

describe('ReportsDashboardPage', () => {
  test('renders combined KPI cards from mocked report data', async () => {
    reportsApi.getCycleReport.mockResolvedValue({ report: baseReport });

    renderDashboard();

    expect(await screen.findByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
    expect(screen.getByText('0/0')).toBeInTheDocument();
  });

  test('shows a "no report yet" message when the cycle has no report', async () => {
    reportsApi.getCycleReport.mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 }),
    );

    renderDashboard();

    expect(await screen.findByText(/no report data/i)).toBeInTheDocument();
  });

  test('lists failures together with their linked defect', async () => {
    reportsApi.getCycleReport.mockResolvedValue({ report: baseReport });
    reportsApi.getCycleFailures.mockResolvedValue({
      failures: [
        {
          origin: 'manual',
          sourceId: 'exec-1',
          testName: 'tc-1',
          status: 'fail',
          linkedDefect: { code: 'DEF-001' },
          evidence: [],
        },
      ],
    });

    renderDashboard();

    expect(await screen.findByText('DEF-001')).toBeInTheDocument();
  });
});
