import { useEffect, useId, useRef, useState } from 'react';
import styles from './Dropzone.module.css';

// No required props: renders a working (if generic) dropzone even if the
// caller doesn't pass onFiles.
//
// pasteEnabled: opt-in (default false, existing usages unaffected) — while
// mounted, listens for a clipboard paste anywhere on the page (e.g.
// Ctrl+V'ing a screenshot) and forwards any pasted files the same way a
// drag-and-drop or file-picker selection would.
//
// compact: opt-in, shrinks the dropzone into a thin single-line banner —
// for spots (like the execution drawer) where the full-size box eats too
// much vertical space relative to how often it's actually used.
export function Dropzone({
  onFiles = () => {},
  multiple = false,
  accept = '',
  hint = '',
  pasteEnabled = false,
  compact = false,
}) {
  const [isOver, setIsOver] = useState(false);
  const inputRef = useRef(null);
  const inputId = useId();

  function handleFiles(fileList) {
    if (fileList && fileList.length > 0) {
      onFiles(fileList);
    }
  }

  useEffect(() => {
    if (!pasteEnabled) return undefined;

    function handlePaste(event) {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      // Direct clipboardData.files works for some paste sources, but a
      // pasted screenshot (e.g. macOS's screenshot-to-clipboard) or an
      // image copied from another app usually only populates .items, each
      // needing an explicit getAsFile() to produce a real File.
      if (clipboardData.files?.length > 0) {
        handleFiles(clipboardData.files);
        return;
      }

      const files = Array.from(clipboardData.items || [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter(Boolean);
      if (files.length > 0) {
        handleFiles(files);
      }
    }

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasteEnabled]);

  return (
    <div
      className={[styles.dropzone, isOver && styles.over, compact && styles.compact]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(event) => {
        event.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsOver(false);
        handleFiles(event.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          inputRef.current?.click();
        }
      }}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className={styles.input}
        onChange={(event) => handleFiles(event.target.files)}
        data-testid="dropzone-input"
      />
      <p className={styles.hint}>{hint}</p>
    </div>
  );
}
