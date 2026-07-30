import { useRef } from 'react';
import styles from './NumberedTextArea.module.css';

// A plain multi-line text field — type, press Enter for the next line —
// where each line gets a number in a read-only gutter, purely for display.
// The numbers are never part of `value`, so copying the content back out is
// just plain text with no numbering embedded in it.
export function NumberedTextArea({ value = '', onChange = () => {}, rows = 8, placeholder = '' }) {
  const gutterRef = useRef(null);
  const lineCount = Math.max(1, value.split('\n').length);

  function handleScroll(event) {
    if (gutterRef.current) {
      gutterRef.current.scrollTop = event.target.scrollTop;
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.gutter} ref={gutterRef} aria-hidden="true">
        {Array.from({ length: lineCount }, (_, index) => (
          <div key={index} className={styles.gutterLine}>
            {index + 1}
          </div>
        ))}
      </div>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={handleScroll}
        rows={rows}
        placeholder={placeholder}
        wrap="off"
      />
    </div>
  );
}
