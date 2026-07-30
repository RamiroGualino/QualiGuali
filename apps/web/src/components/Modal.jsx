import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import styles from './Modal.module.css';

// disableBackdropClose: opt-in, defaults to false so every existing modal
// keeps closing on an outside click. Only the screens that explicitly need
// to prevent accidental data loss (long forms) should pass it.
//
// variant: 'dialog' (default, unchanged centered box) or 'drawer' — a
// full-height panel docked to the right edge, for forms long enough that a
// centered dialog feels cramped. Opt-in per call site, so every existing
// modal keeps its current look.
//
// drawerWidth: opt-in override of the drawer's default 80vw (e.g. "40vw")
// for a single call site, without affecting every other drawer.
//
// dialogMaxWidth: same idea for the default 'dialog' variant — overrides
// its 32rem max-width (e.g. for a floating popup that needs to fit an
// image plus a toolbar, wider than a typical form dialog).
//
// footer: opt-in content pinned below the body, outside its scroll area —
// for modals whose primary actions (e.g. the cycle quick-execution buttons)
// need to stay reachable no matter how far the body has scrolled. Omit it
// and the modal behaves exactly as before: just header + scrolling body.
export function Modal({
  open = false,
  title = '',
  onClose = () => {},
  disableBackdropClose = false,
  variant = 'dialog',
  drawerWidth = null,
  dialogMaxWidth = null,
  footer = null,
  children = null,
}) {
  const { t } = useTranslation();

  if (!open) return null;

  const isDrawer = variant === 'drawer';

  return (
    <div
      className={[styles.backdrop, isDrawer && styles.backdropDrawer].filter(Boolean).join(' ')}
      role="presentation"
      onClick={disableBackdropClose ? undefined : onClose}
    >
      <div
        className={[styles.dialog, isDrawer && styles.drawer].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={
          isDrawer
            ? drawerWidth
              ? { width: drawerWidth }
              : undefined
            : dialogMaxWidth
              ? { maxWidth: dialogMaxWidth }
              : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <Button variant="secondary" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </Button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
