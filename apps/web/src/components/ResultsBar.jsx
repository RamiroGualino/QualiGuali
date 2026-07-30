import { useTranslation } from 'react-i18next';
import styles from './ResultsBar.module.css';

// counts: { pass, fail, blocked, notExecuted }. Stacked bar summarizing an
// execution cycle's results (Kualitee-style), reusing the same 4 execution
// statuses execution-service already tracks — no new domain concept.
//
// Opt-in interactive mode (used by ReportsDashboardPage) turns the bar and
// its legend into a status filter: each segment/legend entry is a button,
// plus an "all" pill, and `selectedStatus` highlights the active one.
export function ResultsBar({
  counts = {},
  compact = false,
  interactive = false,
  selectedStatus = 'all',
  onSelectStatus,
}) {
  const { t } = useTranslation();
  const pass = counts.pass || 0;
  const fail = counts.fail || 0;
  const blocked = counts.blocked || 0;
  const notExecuted = counts.notExecuted || 0;
  const total = pass + fail + blocked + notExecuted;

  const segments = [
    { key: 'pass', value: pass, className: styles.pass, label: t('executions.status_pass') },
    { key: 'fail', value: fail, className: styles.fail, label: t('executions.status_fail') },
    {
      key: 'blocked',
      value: blocked,
      className: styles.blocked,
      label: t('executions.status_blocked'),
    },
    {
      key: 'notExecuted',
      value: notExecuted,
      className: styles.notExecuted,
      label: t('executions.status_not_executed'),
    },
  ];

  function select(key) {
    if (interactive) onSelectStatus?.(key);
  }

  return (
    <div
      className={[styles.wrapper, compact && styles.compact, interactive && styles.interactive]
        .filter(Boolean)
        .join(' ')}
    >
      {interactive && (
        <button
          type="button"
          className={[styles.allPill, selectedStatus === 'all' && styles.allPillActive]
            .filter(Boolean)
            .join(' ')}
          onClick={() => select('all')}
        >
          {t('common.all')}: {total}
        </button>
      )}
      <div
        className={styles.track}
        title={segments.map((s) => `${s.label}: ${s.value}`).join(' · ')}
      >
        {total === 0 ? (
          <div className={styles.empty} />
        ) : (
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) =>
              interactive ? (
                <button
                  key={segment.key}
                  type="button"
                  className={[
                    styles.segmentButton,
                    segment.className,
                    selectedStatus === segment.key && styles.segmentActive,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ width: `${(segment.value / total) * 100}%` }}
                  onClick={() => select(segment.key)}
                  aria-label={`${segment.label}: ${segment.value}`}
                />
              ) : (
                <div
                  key={segment.key}
                  className={segment.className}
                  style={{ width: `${(segment.value / total) * 100}%` }}
                />
              ),
            )
        )}
      </div>
      {!compact && (
        <div className={styles.legend}>
          {segments.map((segment) =>
            interactive ? (
              <button
                key={segment.key}
                type="button"
                className={[
                  styles.legendItem,
                  styles.legendButton,
                  selectedStatus === segment.key && styles.legendActive,
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => select(segment.key)}
              >
                <span className={[styles.dot, segment.className].join(' ')} aria-hidden="true" />
                {segment.label}: {segment.value}
              </button>
            ) : (
              <span key={segment.key} className={styles.legendItem}>
                <span className={[styles.dot, segment.className].join(' ')} aria-hidden="true" />
                {segment.label}: {segment.value}
              </span>
            ),
          )}
        </div>
      )}
      <p className={styles.total}>{t('executionCycles.totalTestCases', { count: total })}</p>
    </div>
  );
}
