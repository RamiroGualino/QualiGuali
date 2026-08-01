import { useTranslation } from 'react-i18next';
import styles from './TestResultsBar.module.css';

// A single consolidated "Estado / Resultados" cell for an automation run
// row — replaces three separate plain-number columns (Total/Pasaron/
// Fallaron) with one glanceable bidirectional bar (green = passed, red =
// failed/broken, gray = skipped) plus the counts that matter most. `broken`
// is folded into the red segment rather than given a fourth color — for a
// "did this run go well" scan, a broken test reads the same as a failed
// one; the exact broken/failed split is still in the counts text below the
// bar and in the run's own detail page.
export function TestResultsBar({ passed = 0, failed = 0, broken = 0, skipped = 0, total = 0 }) {
  const { t } = useTranslation();
  const failedTotal = failed + broken;
  const safeTotal = total > 0 ? total : passed + failedTotal + skipped;

  const passPct = safeTotal > 0 ? (passed / safeTotal) * 100 : 0;
  const failPct = safeTotal > 0 ? (failedTotal / safeTotal) * 100 : 0;
  const skipPct = safeTotal > 0 ? (skipped / safeTotal) * 100 : 0;

  return (
    <div className={styles.container}>
      <div
        className={styles.bar}
        role="img"
        aria-label={t('automation.resultsBarLabel', { passed, failed: failedTotal, skipped })}
      >
        {passPct > 0 && <div className={styles.segmentPass} style={{ width: `${passPct}%` }} />}
        {failPct > 0 && <div className={styles.segmentFail} style={{ width: `${failPct}%` }} />}
        {skipPct > 0 && <div className={styles.segmentSkip} style={{ width: `${skipPct}%` }} />}
      </div>
      <div className={styles.counts}>
        <span className={styles.passCount}>{passed}</span>
        <span className={styles.separator}>/</span>
        <span className={styles.failCount}>{failedTotal}</span>
        {skipped > 0 && (
          <span className={styles.skipCount}>
            ({skipped} {t('automation.skipped').toLowerCase()})
          </span>
        )}
      </div>
    </div>
  );
}
