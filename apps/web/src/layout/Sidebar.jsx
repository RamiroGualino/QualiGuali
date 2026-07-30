import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { useCurrentProjectId } from '../hooks/useCurrentProjectId';
import { Logo } from '../components/Logo';
import styles from './Sidebar.module.css';

const COLLAPSED_STORAGE_KEY = 'qualiguali.sidebarCollapsed';

function getInitialCollapsed() {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
}

// Modules/Requirements/Users all live under Project Management's tabs,
// Test Suites/Test Cases/Templates under Test Management's, and Test
// Plans/Execution Cycles under Test Cycle Management's — each Sidebar entry
// is "active" for any of its own tabs, not just an exact path match.
const PROJECT_MANAGEMENT_PATHS = ['/projects'];
const PROJECT_MANAGEMENT_SUFFIXES = ['/modules', '/requirements'];
const TEST_MANAGEMENT_SUFFIXES = ['/test-suites', '/test-cases', '/test-case-templates'];
const TEST_CYCLE_MANAGEMENT_SUFFIXES = ['/test-plans', '/execution-cycles'];

// No icon library in this project (same reasoning as the language flags:
// plain emoji, zero new dependencies).
const ICONS = {
  projectManagement: '🗂️',
  dashboard: '📊',
  testManagement: '🧪',
  testCycleManagement: '📋',
  automation: '🤖',
  defects: '🐞',
  reports: '📈',
  settings: '⚙️',
};

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M12 3v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path
        d="M7 5.5a8 8 0 1 0 10 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// Single chevron, flipped via CSS transform rather than swapping paths —
// one icon covers both directions.
function ChevronIcon({ collapsed }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
      className={collapsed ? styles.chevronFlipped : undefined}
    >
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// All roles see every entry for now — nothing here is hidden by role. Pages
// like Users already gate their own data fetch against what the backend
// allows and show their existing "no permission" state on their own.
export function Sidebar() {
  const { t } = useTranslation();
  // Sticky, not just the URL param: browsing the unscoped Proyectos list or
  // Settings shouldn't make every project-scoped module vanish from the nav.
  const projectId = useCurrentProjectId();
  const { logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  const isProjectManagementActive =
    PROJECT_MANAGEMENT_PATHS.includes(location.pathname) ||
    (Boolean(projectId) &&
      PROJECT_MANAGEMENT_SUFFIXES.some((suffix) =>
        location.pathname.startsWith(`/projects/${projectId}${suffix}`),
      ));
  const isTestManagementActive = TEST_MANAGEMENT_SUFFIXES.some((suffix) =>
    location.pathname.startsWith(`/projects/${projectId}${suffix}`),
  );
  const isTestCycleManagementActive = TEST_CYCLE_MANAGEMENT_SUFFIXES.some((suffix) =>
    location.pathname.startsWith(`/projects/${projectId}${suffix}`),
  );

  const navItems = [
    projectId && {
      to: `/projects/${projectId}/home`,
      label: t('nav.dashboard'),
      icon: ICONS.dashboard,
    },
    {
      // Preserves the current project context: while inside a project
      // workspace this must not fall back to the bare /projects route, or
      // it silently drops projectId and disables the Modules/Requirements
      // tabs on the very page it's meant to open.
      to: projectId ? `/projects/${projectId}/modules` : '/projects',
      label: t('projectManagement.title'),
      icon: ICONS.projectManagement,
      forceActive: isProjectManagementActive,
    },
    projectId && {
      to: `/projects/${projectId}/test-suites`,
      label: t('testManagement.title'),
      icon: ICONS.testManagement,
      forceActive: isTestManagementActive,
    },
    projectId && {
      to: `/projects/${projectId}/test-plans`,
      label: t('testCycleManagement.title'),
      icon: ICONS.testCycleManagement,
      forceActive: isTestCycleManagementActive,
    },
    projectId && {
      to: `/projects/${projectId}/automation`,
      label: t('nav.automation'),
      icon: ICONS.automation,
    },
    projectId && {
      to: `/projects/${projectId}/defects`,
      label: t('nav.defects'),
      icon: ICONS.defects,
    },
    projectId && {
      to: `/projects/${projectId}/reports`,
      label: t('nav.reports'),
      icon: ICONS.reports,
    },
    { to: '/settings', label: t('nav.settings'), icon: ICONS.settings },
  ].filter(Boolean);

  return (
    <nav
      className={[styles.sidebar, collapsed && styles.sidebarCollapsed].filter(Boolean).join(' ')}
      aria-label="Main navigation"
    >
      <div className={styles.brand}>
        <Logo />
        {!collapsed && t('common.appName')}
      </div>
      <button
        type="button"
        className={styles.collapseButton}
        onClick={() => setCollapsed((current) => !current)}
        title={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
        aria-label={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
      >
        <ChevronIcon collapsed={collapsed} />
        {!collapsed && t('nav.collapseMenu')}
      </button>
      {!collapsed && <p className={styles.menuLabel}>{t('nav.menu')}</p>}
      {navItems.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === '/projects'}
          className={({ isActive }) =>
            [styles.link, (isActive || link.forceActive) && styles.linkActive]
              .filter(Boolean)
              .join(' ')
          }
          title={collapsed ? link.label : undefined}
        >
          <span className={styles.icon} aria-hidden="true">
            {link.icon}
          </span>
          {!collapsed && link.label}
        </NavLink>
      ))}
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.logoutButton}
          onClick={logout}
          title={t('nav.logout')}
          aria-label={t('nav.logout')}
        >
          <PowerIcon />
        </button>
      </div>
    </nav>
  );
}
