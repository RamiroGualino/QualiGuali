import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/PageHeader';
import { Tabs } from '../components/Tabs';
import { TestPlansPage } from './TestPlansPage';
import { ExecutionCyclesPage } from './ExecutionCyclesPage';

function activeTabFor(pathname) {
  if (pathname.endsWith('/execution-cycles')) return 'executionCycles';
  return 'testPlans';
}

// Same consolidation pattern as ProjectManagementPage/TestManagementPage:
// one shared tab bar, each tab's content is an existing page component
// reused as-is. Registered at 2 routes in router.jsx (both pointing here);
// the active tab comes from the URL so deep links and back/forward work.
export function TestCycleManagementPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const location = useLocation();
  const activeTab = activeTabFor(location.pathname);

  const tabs = [
    { key: 'testPlans', label: t('testPlans.title'), to: `/projects/${projectId}/test-plans` },
    {
      key: 'executionCycles',
      label: t('executionCycles.title'),
      to: `/projects/${projectId}/execution-cycles`,
    },
  ];

  return (
    <div>
      <PageHeader title={t('testCycleManagement.title')} />
      <Tabs items={tabs} />
      {activeTab === 'testPlans' && <TestPlansPage />}
      {activeTab === 'executionCycles' && <ExecutionCyclesPage />}
    </div>
  );
}
