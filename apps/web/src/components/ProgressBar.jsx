import styles from './ProgressBar.module.css';

// percent: 0-100. tone controls the fill color; label renders centered on
// the bar itself (matches the "270" count-on-bar look), value is optional
// text under the bar.
//
// remainderTone: opt-in (default null keeps every existing call site
// unchanged — the remaining (100-percent) stays the plain track background).
// When set, the rest of the bar is filled with that tone instead, so the
// bar reads as a two-color split (e.g. green success% + red failure%) in
// one glance, per RuleResultCard's "% Éxito" bar.
export function ProgressBar({ percent = 0, label = '', tone = 'pass', remainderTone = null }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={styles.track}>
      <div className={[styles.fill, styles[tone]].join(' ')} style={{ width: `${clamped}%` }}>
        {label && <span className={styles.label}>{label}</span>}
      </div>
      {remainderTone && clamped < 100 && (
        <div
          className={[styles.remainder, styles[remainderTone]].join(' ')}
          style={{ width: `${Math.round((100 - clamped) * 100) / 100}%` }}
        />
      )}
    </div>
  );
}
