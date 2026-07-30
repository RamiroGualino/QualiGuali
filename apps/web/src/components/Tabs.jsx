import { NavLink } from 'react-router-dom';
import styles from './Tabs.module.css';

// items: [{ key, label, to, end?, disabled?, disabledReason?, count? }]
// A disabled item (e.g. a tab that needs an active project) renders as
// plain text instead of a Link — nothing to navigate to yet. `count` is
// opt-in — omit it and a tab renders exactly as before.
export function Tabs({ items = [] }) {
  return (
    <div className={styles.tabs} role="tablist">
      {items.map((item) =>
        item.disabled ? (
          <span key={item.key} className={styles.tabDisabled} title={item.disabledReason}>
            {item.label}
            {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
          </span>
        ) : (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [styles.tab, isActive && styles.tabActive].filter(Boolean).join(' ')
            }
          >
            {item.label}
            {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
          </NavLink>
        ),
      )}
    </div>
  );
}
