import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import { dataQualityScoreTone } from '../utils/dataQualityScore';
import styles from './DataQualityScoreCard.module.css';

// Etapa 11, punto 13: el "Data Quality Score" como medidor grande — un arco
// semicircular en SVG puro (recharts no tiene un tipo "gauge" nativo; un Pie
// con startAngle/endAngle a 180°/0° es el truco habitual, pero acá alcanza y
// sobra con un <path> propio, sin agregar una dependencia nueva).
const RADIUS = 80;
const HALF_CIRCUMFERENCE = Math.PI * RADIUS;

export function DataQualityScoreCard({ score = null }) {
  const { t } = useTranslation();
  const tone = dataQualityScoreTone(score);
  const clamped = score === null || score === undefined ? 0 : Math.min(100, Math.max(0, score));
  const filled = (clamped / 100) * HALF_CIRCUMFERENCE;

  return (
    <Card className={styles.card}>
      <span className={styles.title}>{t('dataTesting.dataQualityScoreTitle')}</span>
      <div className={styles.gaugeWrapper}>
        <svg className={styles.gauge} viewBox="0 0 200 110" role="img" aria-label={t('dataTesting.dataQualityScoreTitle')}>
          <path d="M 20 100 A 80 80 0 0 1 180 100" className={styles.track} />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            className={[styles.fill, styles[tone]].join(' ')}
            strokeDasharray={`${filled} ${HALF_CIRCUMFERENCE}`}
          />
        </svg>
        <div className={styles.scoreText}>
          <span className={styles.scoreValue}>
            {score === null || score === undefined ? '—' : `${score}%`}
          </span>
          <span className={styles.scoreOutOf}>
            {score === null || score === undefined
              ? t('dataTesting.noScoreAvailable')
              : t('dataTesting.scoreOutOf100', { score })}
          </span>
        </div>
      </div>
    </Card>
  );
}
