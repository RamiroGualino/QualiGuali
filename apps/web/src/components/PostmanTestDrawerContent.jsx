import { useTranslation } from 'react-i18next';
import { StatusBadge } from './StatusBadge';
import { ExpandableText } from './ExpandableText';
import styles from './PostmanTestDrawerContent.module.css';

// Renders one AutomationTestResult's per-request detail (Etapa 4's model
// extension): method/URL, status, request/response headers/body, and
// console logs captured live during a Postman Suite run (Etapa 3). Mirrors
// ExecutionDrawerContent's role for a manual Execution, but read-only and
// far simpler — there's no status transition or evidence upload for a
// Postman test result, only detail to look at.
//
// requestHeaders/requestBody/responseHeaders/responseBody each arrive in
// the hybrid-storage shape execution-service persists them in: null,
// { storage: 'inline', value }, or { storage: 's3', url } (see
// resultStorage.service.js) — resolved here into either nothing, inline
// text, or a link out, without the caller needing to know that shape.
function StoredField({ label, field }) {
  const { t } = useTranslation();
  if (!field) return null;

  if (field.storage === 's3') {
    return (
      <div className={styles.field}>
        <h4>{label}</h4>
        <a href={field.url} target="_blank" rel="noreferrer">
          {t('automation.viewFullContent')}
        </a>
      </div>
    );
  }

  const text = typeof field.value === 'string' ? field.value : JSON.stringify(field.value, null, 2);
  if (!text) return null;

  return (
    <div className={styles.field}>
      <h4>{label}</h4>
      <div className={styles.pre}>
        <ExpandableText text={text} label={label} maxLength={400} multiline />
      </div>
    </div>
  );
}

export function PostmanTestDrawerContent({ testResult }) {
  const { t } = useTranslation();
  if (!testResult) return null;

  const title = testResult.suiteName
    ? `${testResult.suiteName} — ${testResult.testName}`
    : testResult.testName;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>{title}</h3>
        <StatusBadge status={testResult.status} label={testResult.status} />
      </div>

      {(testResult.method || testResult.url) && (
        <p className={styles.requestLine}>
          {testResult.method} {testResult.url}
        </p>
      )}

      {testResult.responseStatus !== null && testResult.responseStatus !== undefined && (
        <p className={styles.meta}>
          {t('automation.responseStatus')}: {testResult.responseStatus}
        </p>
      )}

      {testResult.durationMs !== null && testResult.durationMs !== undefined && (
        <p className={styles.meta}>
          {t('automation.durationMs')}: {testResult.durationMs} ms
        </p>
      )}

      {testResult.errorMessage && <p className={styles.error}>{testResult.errorMessage}</p>}

      <StoredField label={t('automation.requestHeaders')} field={testResult.requestHeaders} />
      <StoredField label={t('automation.requestBody')} field={testResult.requestBody} />
      <StoredField label={t('automation.responseHeaders')} field={testResult.responseHeaders} />
      <StoredField label={t('automation.responseBody')} field={testResult.responseBody} />

      {testResult.logs && testResult.logs.length > 0 && (
        <div className={styles.field}>
          <h4>{t('automation.logs')}</h4>
          <div className={styles.pre}>
            <pre className={styles.logs}>{testResult.logs.join('\n')}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
