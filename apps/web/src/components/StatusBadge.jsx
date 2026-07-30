import styles from './StatusBadge.module.css';

const TONE_BY_STATUS = {
  pass: 'pass',
  passed: 'pass',
  active: 'pass',
  approved: 'pass',
  resolved: 'pass',
  closed: 'neutral',
  fail: 'fail',
  failed: 'fail',
  broken: 'fail',
  open: 'warning',
  reopened: 'warning',
  in_progress: 'warning',
  blocked: 'warning',
  not_executed: 'neutral',
  draft: 'neutral',
  planned: 'neutral',
  archived: 'neutral',
  deprecated: 'neutral',
  skipped: 'neutral',
  // Requirement testing-lifecycle status.
  pending: 'neutral',
  in_test: 'warning',
  finished: 'pass',
  cancelled: 'fail',
  // Priority/severity scale (Requirements, Defects) — shares the same 4
  // tones since there's no dedicated 5th color for "critical".
  low: 'neutral',
  medium: 'warning',
  high: 'fail',
  critical: 'fail',
};

// No required props: an unknown/missing status still renders something
// reasonable instead of throwing.
export function StatusBadge({ status = '', label = '' }) {
  const tone = TONE_BY_STATUS[status] || 'neutral';
  return <span className={[styles.badge, styles[tone]].join(' ')}>{label || status}</span>;
}
