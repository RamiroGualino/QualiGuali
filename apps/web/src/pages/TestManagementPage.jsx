import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { testSuitesApi, testCasesApi, testCaseTemplatesApi } from '../api/qaCore.api';
import { PageHeader } from '../components/PageHeader';
import { Tabs } from '../components/Tabs';
import { TestSuitesPage } from './TestSuitesPage';
import { TestCasesPage } from './TestCasesPage';
import { TestCaseTemplatesPage } from './TestCaseTemplatesPage';
import { ExcelTransformerPage } from './ExcelTransformerPage';

function activeTabFor(pathname) {
  if (pathname.endsWith('/test-cases')) return 'testCases';
  if (pathname.endsWith('/test-case-templates')) return 'templates';
  if (pathname.endsWith('/excel-transformer')) return 'excelTransformer';
  return 'testSuites';
}

// Same consolidation pattern as ProjectManagementPage: one shared tab bar,
// each tab's content is an existing page component reused as-is. Registered
// at 3 routes in router.jsx (all pointing here); the active tab comes from
// the URL so deep links and back/forward both work.
export function TestManagementPage() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const location = useLocation();
  const activeTab = activeTabFor(location.pathname);

  // Tab count badges — these queries use the same cache keys the tab
  // content pages fetch themselves (['testSuites','project',projectId],
  // ['testCases',projectId], ['testCaseTemplates',projectId]), so react
  // -query dedupes the request instead of double-fetching when that tab is
  // the active one.
  const suitesCountQuery = useQuery({
    queryKey: ['testSuites', 'project', projectId],
    queryFn: () => testSuitesApi.list({ projectId }),
  });
  const casesCountQuery = useQuery({
    queryKey: ['testCases', projectId],
    queryFn: () => testCasesApi.list({ projectId }),
  });
  const templatesCountQuery = useQuery({
    queryKey: ['testCaseTemplates', projectId],
    queryFn: () => testCaseTemplatesApi.list(projectId),
  });

  const tabs = [
    {
      key: 'testSuites',
      label: t('testSuites.title'),
      to: `/projects/${projectId}/test-suites`,
      count: suitesCountQuery.data?.testSuites?.length,
    },
    {
      key: 'testCases',
      label: t('testCases.title'),
      to: `/projects/${projectId}/test-cases`,
      count: casesCountQuery.data?.testCases?.length,
    },
    {
      key: 'templates',
      label: t('testCaseTemplates.title'),
      to: `/projects/${projectId}/test-case-templates`,
      count: templatesCountQuery.data?.templates?.length,
    },
    {
      key: 'excelTransformer',
      label: t('excelTransformer.title'),
      to: `/projects/${projectId}/excel-transformer`,
    },
  ];

  return (
    <div>
      <PageHeader title={t('testManagement.title')} />
      <Tabs items={tabs} />
      {activeTab === 'testSuites' && <TestSuitesPage />}
      {activeTab === 'testCases' && <TestCasesPage />}
      {activeTab === 'templates' && <TestCaseTemplatesPage />}
      {activeTab === 'excelTransformer' && <ExcelTransformerPage />}
    </div>
  );
}
