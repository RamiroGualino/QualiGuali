import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
} from 'recharts';
import { Card } from './Card';
import { Button } from './Button';
import { rulesPassFailCounts, qualityByColumn, errorDistributionByColumn } from '../utils/runQualityMetrics';
import { dataQualityScoreTone } from '../utils/dataQualityScore';
import styles from './RunQualityCharts.module.css';

const TOP_COLUMNS_LIMIT = 10;
const ERROR_SLICES_LIMIT = 3;
const RULES_DONUT_COLORS = { passed: 'var(--color-pass)', failed: 'var(--color-fail)' };
const BAR_COLOR_BY_TONE = {
  pass: 'var(--color-pass)',
  warning: 'var(--color-warning)',
  fail: 'var(--color-fail)',
  neutral: 'var(--color-text-secondary)',
};
const ERROR_SLICE_COLORS = ['var(--color-fail)', 'var(--color-warning)', 'var(--color-info)'];
const OTHER_SLICE_COLOR = 'var(--color-text-secondary)';

// Etapa 11, punto 4: 3 gráficos simples (Recharts, ya una dependencia del
// proyecto) siguiendo el mismo patrón donut+barra ya usado en
// ProjectHomePage.jsx — sin agregar ninguna librería nueva.
export function RunQualityCharts({ results = [] }) {
  const { t } = useTranslation();
  const [showAllColumns, setShowAllColumns] = useState(false);

  const rulesCounts = rulesPassFailCounts(results);
  const rulesDonutData = [
    { key: 'passed', name: t('dataTesting.rulesPassedLabel'), value: rulesCounts.passed },
    { key: 'failed', name: t('dataTesting.rulesFailedLabel'), value: rulesCounts.failed },
  ];
  const totalRules = rulesCounts.passed + rulesCounts.failed;

  const columns = qualityByColumn(results);
  const visibleColumns = showAllColumns ? columns : columns.slice(0, TOP_COLUMNS_LIMIT);

  const errorColumns = errorDistributionByColumn(results);
  const totalErrors = errorColumns.reduce((sum, entry) => sum + entry.count, 0);
  const topErrorColumns = errorColumns.slice(0, ERROR_SLICES_LIMIT);
  const otherErrorsCount = errorColumns
    .slice(ERROR_SLICES_LIMIT)
    .reduce((sum, entry) => sum + entry.count, 0);
  const errorDonutData = [
    ...topErrorColumns.map((entry, index) => ({
      key: entry.column,
      name: entry.column,
      value: entry.count,
      color: ERROR_SLICE_COLORS[index % ERROR_SLICE_COLORS.length],
    })),
    ...(otherErrorsCount > 0
      ? [
          {
            key: '__other__',
            name: t('dataTesting.otherColumnsLabel'),
            value: otherErrorsCount,
            color: OTHER_SLICE_COLOR,
          },
        ]
      : []),
  ];

  return (
    <div className={styles.grid}>
      <Card>
        <p className={styles.chartTitle}>{t('dataTesting.rulesDonutTitle')}</p>
        {totalRules === 0 ? (
          <p className={styles.empty}>—</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={rulesDonutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                  {rulesDonutData.map((entry) => (
                    <Cell key={entry.key} fill={RULES_DONUT_COLORS[entry.key]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ul className={styles.legend}>
              {rulesDonutData.map((entry) => (
                <li key={entry.key}>
                  <span
                    className={styles.legendSwatch}
                    style={{ backgroundColor: RULES_DONUT_COLORS[entry.key] }}
                  />
                  {entry.name}: {entry.value} (
                  {totalRules > 0 ? Math.round((entry.value / totalRules) * 100) : 0}%)
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card>
        <p className={styles.chartTitle}>{t('dataTesting.qualityByColumnTitle')}</p>
        {columns.length === 0 ? (
          <p className={styles.empty}>—</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(160, visibleColumns.length * 32)}>
              <BarChart data={visibleColumns} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} unit="%" />
                <YAxis type="category" dataKey="column" width={90} />
                <Tooltip />
                <Bar dataKey="percent" name={t('dataTesting.successPercentHeader')}>
                  {visibleColumns.map((entry) => (
                    <Cell key={entry.column} fill={BAR_COLOR_BY_TONE[dataQualityScoreTone(entry.percent)]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {columns.length > TOP_COLUMNS_LIMIT && (
              <Button variant="secondary" size="sm" onClick={() => setShowAllColumns((v) => !v)}>
                {showAllColumns
                  ? t('dataTesting.viewFewerColumns')
                  : t('dataTesting.viewAllColumns', { count: columns.length })}
              </Button>
            )}
          </>
        )}
      </Card>

      <Card>
        <p className={styles.chartTitle}>{t('dataTesting.errorDistributionTitle')}</p>
        {errorDonutData.length === 0 ? (
          <p className={styles.empty}>—</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={errorDonutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                >
                  {errorDonutData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <ul className={styles.legend}>
              {errorDonutData.map((entry) => (
                <li key={entry.key}>
                  <span className={styles.legendSwatch} style={{ backgroundColor: entry.color }} />
                  {entry.name}:{' '}
                  {totalErrors > 0 ? Math.round((entry.value / totalErrors) * 100) : 0}% (
                  {t('dataTesting.rulesCountLabel', { count: entry.value })})
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
