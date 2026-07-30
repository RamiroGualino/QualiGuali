import { useId } from 'react';
import styles from './Combobox.module.css';

// A plain <input> paired with a native <datalist> — typing filters the
// suggestions, and the browser's own affordance shows the full option set
// too, no custom dropdown JS needed. `options` is [{ value, label }], but a
// native datalist only round-trips the visible text a user typed/picked,
// not a separate id — the caller is responsible for matching that text
// back to an option's value (see TestSuitesPage/ExecutionCyclesPage).
export function Combobox({
  label = '',
  value = '',
  onChange = () => {},
  options = [],
  required = false,
  placeholder = '',
}) {
  const id = useId();
  const listId = `${id}-list`;

  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
      )}
      <input
        id={id}
        list={listId}
        className={styles.input}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.label} />
        ))}
      </datalist>
    </div>
  );
}
