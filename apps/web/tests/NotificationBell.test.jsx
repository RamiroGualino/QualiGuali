import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import i18n from '../src/i18n';
import { NotificationBell } from '../src/components/NotificationBell';
import { notificationsApi } from '../src/api/notifications.api';

vi.mock('../src/api/notifications.api', () => ({
  notificationsApi: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

beforeAll(() => i18n.changeLanguage('en'));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  notificationsApi.list.mockResolvedValue({ notifications: [], unreadCount: 0 });
  notificationsApi.markRead.mockResolvedValue({ notification: {} });
  notificationsApi.markAllRead.mockResolvedValue(undefined);
});

function renderBell({ initialEntry = '/projects/proj-1/home' } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/projects/:projectId/home" element={<NotificationBell />} />
          <Route
            path="/projects/:projectId/automation/runs/:runId"
            element={<p>run detail page</p>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('NotificationBell', () => {
  test('renders no badge when there are no unread notifications', async () => {
    renderBell();

    expect(await screen.findByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.queryByText(/^\d+\+?$/)).not.toBeInTheDocument();
  });

  test('shows the unread count as a badge', async () => {
    notificationsApi.list.mockResolvedValue({ notifications: [], unreadCount: 3 });
    renderBell();

    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  test('caps the badge at "9+" for a large unread count', async () => {
    notificationsApi.list.mockResolvedValue({ notifications: [], unreadCount: 42 });
    renderBell();

    expect(await screen.findByText('9+')).toBeInTheDocument();
  });

  test('renders nothing when there is no current project to scope notifications to', () => {
    renderBell({ initialEntry: '/' });
    expect(screen.queryByRole('button', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  test('opens the panel and lists notifications on click', async () => {
    notificationsApi.list.mockResolvedValue({
      notifications: [
        {
          _id: 'notif-1',
          title: 'Automation run failed',
          message: '"Smoke API" had 1 failed test(s)',
          relatedAutomationRunId: 'run-1',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: 'Notifications' }));

    expect(await screen.findByText('"Smoke API" had 1 failed test(s)')).toBeInTheDocument();
  });

  test('marking all as read calls the API for the current project', async () => {
    notificationsApi.list.mockResolvedValue({
      notifications: [
        {
          _id: 'notif-1',
          title: 'Automation run failed',
          message: 'failed',
          relatedAutomationRunId: 'run-1',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByText('Mark all as read'));

    expect(notificationsApi.markAllRead).toHaveBeenCalledWith('proj-1');
  });

  test('clicking an unread notification marks it read and navigates to its run', async () => {
    notificationsApi.list.mockResolvedValue({
      notifications: [
        {
          _id: 'notif-1',
          title: 'Automation run failed',
          message: 'failed',
          relatedAutomationRunId: 'run-42',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
    });
    const user = userEvent.setup();
    renderBell();

    await user.click(await screen.findByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByText('failed'));

    expect(notificationsApi.markRead).toHaveBeenCalledWith('notif-1');
    expect(await screen.findByText('run detail page')).toBeInTheDocument();
  });
});
