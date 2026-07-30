import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCurrentProjectId } from '../hooks/useCurrentProjectId';
import { PageHeader } from '../components/PageHeader';
import { Tabs } from '../components/Tabs';
import { ProjectsPage } from './ProjectsPage';
import { ModulesPage } from './ModulesPage';
import { RequirementsPage } from './RequirementsPage';

function activeTabFor(pathname) {
  if (pathname.endsWith('/modules')) return 'modules';
  if (pathname.endsWith('/requirements')) return 'requirements';
  return 'projects';
}

// Consolidates Projects/Modules/Requirements under one module with a shared
// tab bar, reusing each area's existing page component as-is for its tab
// content — this file only owns the tab chrome and which one is active.
// Registered at 3 routes in router.jsx (all pointing here); the active tab
// is derived from the URL, not local state, so browser back/forward and
// deep links both work. Users moved out to Configuración — see
// SettingsPage — since user administration isn't really a
// project-management concern and the header's project switcher is now the
// only place to open/switch a project.
export function ProjectManagementPage() {
  const { t } = useTranslation();
  // Sticky, not just the URL param: the Proyectos tab itself is unscoped, so
  // without this, clicking into it would grey out Modules/Requirements even
  // though a project is still effectively selected.
  const projectId = useCurrentProjectId();
  const location = useLocation();
  const activeTab = activeTabFor(location.pathname);

  const tabs = [
    { key: 'projects', label: t('projects.title'), to: '/projects', end: true },
    {
      key: 'modules',
      label: t('modules.title'),
      to: projectId ? `/projects/${projectId}/modules` : undefined,
      disabled: !projectId,
      disabledReason: t('projectManagement.selectProjectFirst'),
    },
    {
      key: 'requirements',
      label: t('requirements.title'),
      to: projectId ? `/projects/${projectId}/requirements` : undefined,
      disabled: !projectId,
      disabledReason: t('projectManagement.selectProjectFirst'),
    },
  ];

  return (
    <div>
      <PageHeader title={t('projectManagement.title')} />
      <Tabs items={tabs} />
      {activeTab === 'projects' && <ProjectsPage />}
      {activeTab === 'modules' && <ModulesPage />}
      {activeTab === 'requirements' && <RequirementsPage />}
    </div>
  );
}
