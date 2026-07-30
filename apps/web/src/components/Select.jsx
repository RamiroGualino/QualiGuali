import { useId } from 'react';
import styles from './TextField.module.css';

// Deliberately reuses TextField's styling so labels/inputs line up.
export function Select({
  label = '',
  value = '',
  onChange = () => {},
  options = [],
  required = false,
  disabled = false,
}) {
  const id = useId();

  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
      )}
      <select
        id={id}
        className={styles.input}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
