import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import i18n from '../src/i18n';
import { PostmanSuitesPage } from '../src/pages/PostmanSuitesPage';
import { postmanSuitesApi } from '../src/api/execution.api';
import { requirementsApi } from '../src/api/qaCore.api';

vi.mock('../src/api/execution.api', () => ({
  postmanSuitesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    run: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../src/api/qaCore.api', () => ({
  requirementsApi: { list: vi.fn() },
}));

beforeAll(() => i18n.changeLanguage('en'));

beforeEach(() => {
  vi.clearAllMocks();
  requirementsApi.list.mockResolvedValue({ requirements: [] });
});

const baseSuite = {
  _id: 'suite-1',
  name: 'Smoke API',
  collectionVersion: 1,
  environmentFileUrl: null,
  environmentVersion: null,
  isActive: true,
};

function renderPage(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/projects/proj-1/automation/suites']}>
        <Routes>
          <Route path="/projects/:projectId/automation/suites" element={<PostmanSuitesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return queryClient;
}

describe('PostmanSuitesPage — run status indicator', () => {
  test('shows the Run button when the Suite is idle', async () => {
    postmanSuitesApi.list.mockResolvedValue({
      postmanSuites: [{ ...baseSuite, isRunning: false }],
    });

    renderPage();

    expect(await screen.findByRole('button', { name: 'Run' })).toBeInTheDocument();
  });

  test('shows a spinner and "Running…" instead of the Run button while isRunning is true', async () => {
    postmanSuitesApi.list.mockResolvedValue({
      postmanSuites: [{ ...baseSuite, isRunning: true }],
    });

    renderPage();

    expect(await screen.findByText('Running…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
  });

  test('shows a transient "Passed" result right after the Suite stops running', async () => {
    postmanSuitesApi.list
      .mockResolvedValueOnce({ postmanSuites: [{ ...baseSuite, isRunning: true }] })
      .mockResolvedValue({ postmanSuites: [{ ...baseSuite, isRunning: false }] });
    postmanSuitesApi.get.mockResolvedValue({
      postmanSuite: { ...baseSuite, lastRunStatus: 'completed' },
    });

    const queryClient = renderPage();
    expect(await screen.findByText('Running…')).toBeInTheDocument();

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['postmanSuites', 'proj-1'] });
    });

    expect(await screen.findByText(/Passed/)).toBeInTheDocument();
    expect(screen.queryByText('Running…')).not.toBeInTheDocument();
  });

  // The bug this guards: the Actions column reflects whether the Suite
  // itself executed (PostmanSuite.lastRunStatus), never whether the run's
  // individual tests passed — a completed run with failing/broken tests
  // must still show "Passed" here; that detail belongs in the report, not
  // this row (see the on-page comment right above the effect that sets
  // justFinished).
  test('still shows "Passed" when the suite executed but some of its tests failed', async () => {
    postmanSuitesApi.list
      .mockResolvedValueOnce({ postmanSuites: [{ ...baseSuite, isRunning: true }] })
      .mockResolvedValue({ postmanSuites: [{ ...baseSuite, isRunning: false }] });
    postmanSuitesApi.get.mockResolvedValue({
      postmanSuite: { ...baseSuite, lastRunStatus: 'completed' },
    });

    const queryClient = renderPage();
    await screen.findByText('Running…');

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['postmanSuites', 'proj-1'] });
    });

    expect(await screen.findByText(/Passed/)).toBeInTheDocument();
  });

  test('shows a transient "Failed" result only when the suite itself failed to execute', async () => {
    postmanSuitesApi.list
      .mockResolvedValueOnce({ postmanSuites: [{ ...baseSuite, isRunning: true }] })
      .mockResolvedValue({ postmanSuites: [{ ...baseSuite, isRunning: false }] });
    postmanSuitesApi.get.mockResolvedValue({
      postmanSuite: { ...baseSuite, lastRunStatus: 'timeout' },
    });

    const queryClient = renderPage();
    await screen.findByText('Running…');

    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['postmanSuites', 'proj-1'] });
    });

    expect(await screen.findByText(/Failed/)).toBeInTheDocument();
  });
});

const baseRequirement = { _id: 'req-1', code: 'REQ-1', title: 'Login flow' };

describe('PostmanSuitesPage — requirement relationship', () => {
  test('Create stays disabled until a Requirement is picked', async () => {
    postmanSuitesApi.list.mockResolvedValue({ postmanSuites: [] });
    requirementsApi.list.mockResolvedValue({ requirements: [baseRequirement] });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'New suite' }));

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();

    // Two "Requirements" labels are on screen at once here (the filter
    // Select behind the modal, and the create form's own Combobox) —
    // targeted by its distinct placeholder instead of getByLabelText.
    await user.type(screen.getByPlaceholderText('Select a requirement'), 'Login flow');
    await user.type(screen.getByLabelText('Name'), 'Smoke API');

    // Still disabled — no collection file chosen yet.
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  test("shows the suite's Requirement code in the table", async () => {
    postmanSuitesApi.list.mockResolvedValue({
      postmanSuites: [{ ...baseSuite, isRunning: false, requirementId: 'req-1' }],
    });
    requirementsApi.list.mockResolvedValue({ requirements: [baseRequirement] });

    renderPage();

    expect(await screen.findByText('REQ-1')).toBeInTheDocument();
  });

  test('filters the suites list by the selected Requirement', async () => {
    postmanSuitesApi.list.mockResolvedValue({
      postmanSuites: [{ ...baseSuite, isRunning: false, requirementId: 'req-1' }],
    });
    requirementsApi.list.mockResolvedValue({ requirements: [baseRequirement] });
    const user = userEvent.setup();

    renderPage();
    await screen.findByText('Smoke API');
    postmanSuitesApi.list.mockClear();

    await user.selectOptions(screen.getByLabelText('Requirements'), 'req-1');

    await waitFor(() =>
      expect(postmanSuitesApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ requirementId: 'req-1' }),
      ),
    );
  });
});

describe('PostmanSuitesPage — delete', () => {
  test('removes a suite after confirming, via the row menu', async () => {
    postmanSuitesApi.list.mockResolvedValue({
      postmanSuites: [{ ...baseSuite, isRunning: false }],
    });
    postmanSuitesApi.remove.mockResolvedValue({});
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));

    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(postmanSuitesApi.remove).toHaveBeenCalledWith('suite-1'));
  });
});
