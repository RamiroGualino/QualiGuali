import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from './RowActionsMenu.module.css';

// actions: [{ label, onClick, danger? }]
//
// Rendered through a portal into document.body, positioned via the
// trigger's own bounding rect: Table's wrapper has `overflow-x: auto`,
// which per the CSS spec silently turns `overflow-y` into `auto` too — an
// absolutely-positioned menu nested inside it gets clipped the moment the
// table needs to scroll. Fixed-position + portal escapes that entirely.
export function RowActionsMenu({ actions = [] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({ top: rect.bottom + 4, left: rect.right });
    }

    updatePosition();

    function handleClickOutside(event) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(event.target) &&
        menuRef.current &&
        !menuRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        aria-label={t('common.actions')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋮
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            role="menu"
            style={{ top: position.top, left: position.left, transform: 'translateX(-100%)' }}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                className={[styles.item, action.danger && styles.danger].filter(Boolean).join(' ')}
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
