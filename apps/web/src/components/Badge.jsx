import styles from './Badge.module.css';

// For identifiers (REQ-001, TC-014, DEF-003...) — a semi-transparent,
// color-coded pill instead of plain text. Distinct from StatusBadge, which
// encodes a *state* (pass/fail/open/...); this just labels a reference.
export function Badge({ children, tone = 'neutral' }) {
  return <span className={[styles.badge, styles[tone]].filter(Boolean).join(' ')}>{children}</span>;
}
