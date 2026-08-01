import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications.api';
import { useCurrentProjectId } from '../hooks/useCurrentProjectId';
import styles from './NotificationBell.module.css';

// Etapa 7 (docs/postman-runner/etapa-7-sistema-de-alertas.md): "canal
// inicial: notificaciones internas... el frontend hace polling con react
// query (refetchInterval)" — no WebSockets/SSE, same "server state" pattern
// the rest of the app already uses via React Query, just with an interval
// instead of a one-shot fetch. 30s: frequent enough that a failed run shows
// up promptly without polling so often it'd feel like it's hammering
// reports-service for what's still a low-stakes, non-realtime alert.
const POLL_INTERVAL_MS = 30000;
const MAX_BADGE_COUNT = 9;

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        d="M6 9a6 6 0 1 1 12 0c0 3.5 1 5 2 6H4c1-1 2-2.5 2-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M9.5 18a2.5 2.5 0 0 0 5 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function formatRelatedTime(createdAt) {
  return new Date(createdAt).toLocaleString();
}

export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = useCurrentProjectId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null);

  const notificationsQuery = useQuery({
    queryKey: ['notifications', projectId],
    queryFn: () => notificationsApi.list({ projectId, limit: 20 }),
    enabled: Boolean(projectId),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => notificationsApi.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', projectId] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', projectId] }),
  });

  const notifications = notificationsQuery.data?.notifications || [];
  const unreadCount = notificationsQuery.data?.unreadCount || 0;

  useEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    updatePosition();

    function handleClickOutside(event) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target) &&
        panelRef.current &&
        !panelRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  // No project selected yet (e.g. on the unscoped /projects list) — nothing
  // to scope notifications to, so there's nothing useful to show or poll.
  if (!projectId) return null;

  function handleNotificationClick(notification) {
    if (!notification.isRead) markReadMutation.mutate(notification._id);
    setOpen(false);
    navigate(`/projects/${projectId}/automation/runs/${notification.relatedAutomationRunId}`);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        aria-label={t('notifications.title')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unreadCount}
          </span>
        )}
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            role="menu"
            style={{ top: position.top, right: position.right }}
          >
            <div className={styles.panelHeader}>
              <span>{t('notifications.title')}</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  className={styles.markAllButton}
                  onClick={() => markAllReadMutation.mutate()}
                >
                  {t('notifications.markAllRead')}
                </button>
              )}
            </div>
            {notifications.length === 0 && (
              <p className={styles.empty}>{t('notifications.empty')}</p>
            )}
            {notifications.map((notification) => (
              <button
                key={notification._id}
                type="button"
                role="menuitem"
                className={[styles.item, !notification.isRead && styles.unread]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleNotificationClick(notification)}
              >
                <span className={styles.itemTitle}>{notification.title}</span>
                <span className={styles.itemMessage}>{notification.message}</span>
                <span className={styles.itemTime}>{formatRelatedTime(notification.createdAt)}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
