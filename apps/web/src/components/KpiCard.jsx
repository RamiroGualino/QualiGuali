import { Card } from './Card';
import styles from './KpiCard.module.css';

// breakdown: optional [{ label, value }] rendered as a small sub-line under
// the main number (e.g. "163 Passed  ·  28 Not executed"). accent controls
// the top border color, independent of tone (which colors the number
// itself) — a card can have an info-colored top border with a fail-colored
// value, same as Kualitee's dashboard.
export function KpiCard({
  label = '',
  value = '—',
  tone = 'default',
  accent = null,
  breakdown = [],
}) {
  return (
    <Card className={[styles.card, accent && styles[`accent-${accent}`]].filter(Boolean).join(' ')}>
      <span className={styles.label}>{label}</span>
      <span className={[styles.value, styles[tone]].join(' ')}>{value}</span>
      {breakdown.length > 0 && (
        <span className={styles.breakdown}>
          {breakdown.map((item, index) => (
            <span key={item.label}>
              {index > 0 && ' · '}
              {item.value} {item.label}
            </span>
          ))}
        </span>
      )}
    </Card>
  );
}
