import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';
import { Button } from './Button';
import styles from './ConfirmModal.module.css';

export function ConfirmModal({
  open = false,
  title = '',
  message = '',
  onConfirm = () => {},
  onCancel = () => {},
  isConfirming = false,
}) {
  const { t } = useTranslation();

  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={isConfirming}>
          {t('common.delete')}
        </Button>
      </div>
    </Modal>
  );
}
