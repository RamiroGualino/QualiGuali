import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Modal } from './Modal';
import styles from './ExpandableText.module.css';

// Renders free text that might, in practice, be a giant blob (someone
// mapped an Excel column with pasted JSON into a preconditions/comments/
// title field) — without this, a single unbroken run of that size blows
// out table rows and detail panels alike, since neither `white-space:
// pre-wrap` nor jsPDF's own wrapping breaks a run with no whitespace in it.
//
// maxLength: null (the default) always collapses — for table cells, where
// a value should never take more than one line regardless of its actual
// length. A number only collapses text longer than that — for detail
// panels, where a normal paragraph should keep reading inline as before,
// and only a genuinely oversized value gets hidden behind a click.
export function ExpandableText({
  text = '',
  emptyFallback = '—',
  label = '',
  maxLength = null,
  multiline = false,
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!text) return emptyFallback;

  const shouldCollapse = maxLength === null || text.length > maxLength;
  if (!shouldCollapse) {
    return multiline ? <span className={styles.preserveWhitespace}>{text}</span> : text;
  }

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <button type="button" className={styles.trigger} onClick={() => setIsOpen(true)}>
        {text}
      </button>
      <Modal
        open={isOpen}
        title={label || t('common.viewFullText')}
        onClose={() => setIsOpen(false)}
        dialogMaxWidth="40rem"
      >
        <pre className={styles.fullText}>{text}</pre>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
