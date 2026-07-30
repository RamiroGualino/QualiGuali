import { useId } from 'react';
import styles from './TextField.module.css';

export function TextField({
  label = '',
  value = '',
  onChange = () => {},
  type = 'text',
  required = false,
  error = '',
  placeholder = '',
  as = 'input',
  rows = 3,
  ...rest
}) {
  const id = useId();
  const Component = as === 'textarea' ? 'textarea' : 'input';

  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
      )}
      <Component
        id={id}
        type={as === 'textarea' ? undefined : type}
        rows={as === 'textarea' ? rows : undefined}
        className={[styles.input, error && styles.inputError].filter(Boolean).join(' ')}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
      {error && <span className={styles.errorText}>{error}</span>}
    </div>
  );
}
