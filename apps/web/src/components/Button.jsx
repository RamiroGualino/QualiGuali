import styles from './Button.module.css';

// No required props: a bare <Button /> renders a sane default rather than
// breaking. `icon` is opt-in (e.g. a leading "+" for create actions) — omit
// it and nothing changes from before.
export function Button({
  children = '',
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  icon = null,
  onClick,
  ...rest
}) {
  const className = [styles.button, styles[variant], styles[size]].filter(Boolean).join(' ');
  return (
    <button type={type} className={className} disabled={disabled} onClick={onClick} {...rest}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}
