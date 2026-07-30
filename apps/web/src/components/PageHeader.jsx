import styles from './PageHeader.module.css';

// `leading` is opt-in — e.g. a <BackButton /> on a detail screen — and sits
// to the left of the title; every existing call site without it is
// unaffected.
export function PageHeader({ title = '', leading = null, action = null }) {
  return (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        {leading}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {action}
    </div>
  );
}
