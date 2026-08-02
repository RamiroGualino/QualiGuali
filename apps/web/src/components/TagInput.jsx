import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './TagInput.module.css';

// Etapa 6.1 (docs/data-testing/etapa-6.1-Rediseño UX.md), sección 5: los
// campos que hoy eran texto libre "separado por coma" (o "uno por línea")
// pasan a esto — se escribe un valor, Enter lo convierte en una pastilla
// removible, en vez de depender de que el usuario tipee separadores de
// forma consistente. Controlado (`value: string[]`), mismo criterio que
// Combobox/TextField en el resto del app.
export function TagInput({ label = '', value = [], onChange = () => {}, placeholder = '' }) {
  const { t } = useTranslation();
  const id = useId();
  const [draft, setDraft] = useState('');

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed) onChange([...value, trimmed]);
    setDraft('');
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  function removeTag(index) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <div className={styles.box}>
        <ul className={styles.tagList} role="list">
          {value.map((tag, index) => (
            <li key={`${tag}-${index}`} role="listitem" aria-label={tag} className={styles.tag}>
              {tag}
              <button
                type="button"
                className={styles.tagRemove}
                onClick={() => removeTag(index)}
                aria-label={t('common.remove')}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <input
          id={id}
          type="text"
          className={styles.input}
          value={draft}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
        />
      </div>
    </div>
  );
}
