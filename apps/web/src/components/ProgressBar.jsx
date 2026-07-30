import styles from './ProgressBar.module.css';

// percent: 0-100. tone controls the fill color; label renders centered on
// the bar itself (matches the "270" count-on-bar look), value is optional
// text under the bar.
export function ProgressBar({ percent = 0, label = '', tone = 'pass' }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={styles.track}>
      <div className={[styles.fill, styles[tone]].join(' ')} style={{ width: `${clamped}%` }}>
        {label && <span className={styles.label}>{label}</span>}
      </div>
    </div>
  );
}
