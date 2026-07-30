import styles from './Logo.module.css';

// "QG" monogram: plain inline SVG (no external asset/library) using
// currentColor throughout, so it inherits the brand color from CSS and
// flips automatically with the light/dark theme.
export function Logo() {
  return (
    <svg
      className={styles.logo}
      viewBox="0 0 32 32"
      width="28"
      height="28"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <text
        x="16"
        y="21"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fill="currentColor"
      >
        QG
      </text>
    </svg>
  );
}
