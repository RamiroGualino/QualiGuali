import styles from './Card.module.css';

export function Card({ children = null, className = '', ...rest }) {
  return (
    <div className={[styles.card, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
