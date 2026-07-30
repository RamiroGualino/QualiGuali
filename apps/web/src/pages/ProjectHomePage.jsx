import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { modulesApi } from '../api/projects.api';
import { requirementsApi, testCasesApi, testSuitesApi } from '../api/qaCore.api';
import { executionCyclesApi } from '../api/execution.api';
import { defectsApi } from '../api/defects.api';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { KpiCard } from '../components/KpiCard';
import { LoadingState, EmptyState } from '../components/QueryStates';
import styles from './ProjectHomePage.module.css';

const OPEN_DEFECT_STATUSES = ['open', 'in_progress', 'reopened'];
const MAX_BAR_ROWS = 10;
const DONUT_COLORS = { covered: 'var(--color-pass)', uncovered: 'var(--color-fail)' };
// Stable references so the `|| []` fallback doesn't create a new array on
// every render (which would defeat the useMemo hooks below).
const EMPTY_ARRAY = [];

export function ProjectHomePage() {
  const { t } = useTranslation();
  const { projectId } = useParams();

  const modulesQuery = useQuery({
    queryKey: ['modules', projectId],
    queryFn: () => modulesApi.list(projectId),
  });
  const requirementsQuery = useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => requirementsApi.list(projectId),
  });
  const testSuitesQuery = useQuery({
    queryKey: ['testSuites', 'project', projectId],
    queryFn: () => testSuitesApi.list({ projectId }),
  });
  const testCasesQuery = useQuery({
    queryKey: ['testCases', projectId],
    queryFn: () => testCasesApi.list({ projectId }),
  });
  // A single query resolves cycles -> executions in one go (there's no
  // project-wide "all executions" endpoint, only per-cycle) so the KPI
  // breakdown (pass/fail/not_executed) reflects every cycle at once.
  const executionsQuery = useQuery({
    queryKey: ['projectExecutions', projectId],
    queryFn: async () => {
      const { executionCycles } = await executionCyclesApi.list(projectId);
      const perCycle = await Promise.all(
        executionCycles.map((cycle) => executionCyclesApi.listExecutions(cycle._id)),
      );
      return {
        executionCycles,
        executions: perCycle.flatMap((result) => result.executions),
      };
    },
  });
  const defectsQuery = useQuery({
    queryKey: ['defects', projectId],
    queryFn: () => defectsApi.list({ projectId }),
  });

  const isLoading = [
    modulesQuery,
    requirementsQuery,
    testSuitesQuery,
    testCasesQuery,
    executionsQuery,
    defectsQuery,
  ].some((query) => query.isLoading);

  const modules = modulesQuery.data?.modules || EMPTY_ARRAY;
  const requirements = requirementsQuery.data?.requirements || EMPTY_ARRAY;
  const testSuites = testSuitesQuery.data?.testSuites || EMPTY_ARRAY;
  const testCases = testCasesQuery.data?.testCases || EMPTY_ARRAY;
  const executions = executionsQuery.data?.executions || EMPTY_ARRAY;
  const defects = defectsQuery.data?.defects || EMPTY_ARRAY;

  const openDefectsCount = defects.filter((defect) =>
    OPEN_DEFECT_STATUSES.includes(defect.status),
  ).length;

  const executionBreakdown = useMemo(() => {
    const passed = executions.filter((execution) => execution.status === 'pass').length;
    // "blocked" isn't one of the three requested buckets — folded into
    // Failed since it isn't Passed and isn't Not executed either.
    const failed = executions.filter((execution) =>
      ['fail', 'blocked'].includes(execution.status),
    ).length;
    const notExecuted = executions.filter(
      (execution) => execution.status === 'not_executed',
    ).length;
    return { passed, failed, notExecuted };
  }, [executions]);

  const requirementCoverage = useMemo(() => {
    const suiteIdToRequirementId = Object.fromEntries(
      testSuites.map((suite) => [suite._id, suite.requirementId]),
    );
    const countByRequirementId = {};
    testCases.forEach((testCase) => {
      const requirementId = suiteIdToRequirementId[testCase.suiteId];
      if (!requirementId) return;
      countByRequirementId[requirementId] = (countByRequirementId[requirementId] || 0) + 1;
    });

    const rows = requirements
      .map((requirement) => ({
        code: requirement.code,
        count: countByRequirementId[requirement._id] || 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_BAR_ROWS);

    const coveredCount = requirements.filter(
      (requirement) => (countByRequirementId[requirement._id] || 0) > 0,
    ).length;
    const uncoveredCount = requirements.length - coveredCount;

    return { rows, coveredCount, uncoveredCount };
  }, [requirements, testSuites, testCases]);

  const coveragePercent =
    requirements.length > 0
      ? Math.round((requirementCoverage.coveredCount / requirements.length) * 100)
      : 0;

  const donutData = [
    { key: 'covered', name: t('projectHome.covered'), value: requirementCoverage.coveredCount },
    {
      key: 'uncovered',
      name: t('projectHome.uncovered'),
      value: requirementCoverage.uncoveredCount,
    },
  ];

  return (
    <div>
      <PageHeader title={t('projectHome.title')} />

      {isLoading && <LoadingState />}

      {!isLoading && (
        <>
          <div className={styles.kpiGrid}>
            <KpiCard
              label={t('projectHome.modulesAndRequirements')}
              value={requirements.length}
              accent="info"
              breakdown={[{ value: modules.length, label: t('nav.modules') }]}
            />
            <KpiCard
              label={t('nav.testCases')}
              value={testCases.length}
              accent="pass"
              breakdown={[{ value: testSuites.length, label: t('testSuites.title') }]}
            />
            <KpiCard
              label={t('projectHome.executions')}
              value={executions.length}
              accent="warning"
              breakdown={[
                { value: executionBreakdown.passed, label: t('executions.status_pass') },
                { value: executionBreakdown.failed, label: t('executions.status_fail') },
                {
                  value: executionBreakdown.notExecuted,
                  label: t('executions.status_not_executed'),
                },
              ]}
            />
            <KpiCard
              label={t('projectHome.openDefects')}
              value={openDefectsCount}
              tone={openDefectsCount > 0 ? 'fail' : 'pass'}
              accent="fail"
              breakdown={[{ value: defects.length, label: t('common.total') }]}
            />
          </div>

          <Card className={styles.summary}>
            <p className={styles.summaryTitle}>{t('projectHome.summaryTitle')}</p>
            <p className={styles.summaryText}>
              {t('projectHome.summaryText', {
                requirements: requirements.length,
                testCases: testCases.length,
                executions: executions.length,
                defects: openDefectsCount,
              })}
            </p>
          </Card>

          <div className={styles.chartsGrid}>
            <Card>
              <p className={styles.chartTitle}>{t('projectHome.coverageChartTitle')}</p>
              {requirementCoverage.rows.length === 0 ? (
                <EmptyState message={t('requirements.emptyState')} />
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={requirementCoverage.rows} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis type="category" dataKey="code" width={90} />
                    <Tooltip />
                    <Bar dataKey="count" name={t('nav.testCases')} fill="var(--color-info)" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <p className={styles.chartTitle}>{t('projectHome.linkageChartTitle')}</p>
              {requirements.length === 0 ? (
                <EmptyState message={t('requirements.emptyState')} />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={70}
                        outerRadius={110}
                      >
                        {donutData.map((entry) => (
                          <Cell key={entry.key} fill={DONUT_COLORS[entry.key]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className={styles.donutLegend}>
                    {donutData.map((entry) => (
                      <li key={entry.key}>
                        <span
                          className={styles.legendSwatch}
                          style={{ backgroundColor: DONUT_COLORS[entry.key] }}
                        />
                        {entry.name}: {entry.value} (
                        {requirements.length > 0
                          ? Math.round((entry.value / requirements.length) * 100)
                          : 0}
                        %)
                      </li>
                    ))}
                  </ul>
                  <p className={styles.coverageTotal}>
                    {t('projectHome.coveragePercent', { percent: coveragePercent })}
                  </p>
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
