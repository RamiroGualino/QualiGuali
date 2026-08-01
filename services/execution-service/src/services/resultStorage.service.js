const s3Client = require('../clients/s3Client');

const DEFAULT_INLINE_THRESHOLD_BYTES = 20 * 1024; // 20KB
const DEFAULT_MAX_LOG_COUNT = 50;
const DEFAULT_MAX_LOG_LENGTH = 2000;

// Etapa 4 (docs/postman-runner/etapa-4-modelo-de-resultados.md): hybrid
// Mongo/S3 storage for request/response headers/bodies, same reasoning
// already applied to evidence/raw reports — a paginated list response or a
// large upload body would otherwise inflate AutomationTestResult documents
// (and the collection's indexes) without bound.

// Pure — no I/O. `value` is whatever's about to be stored (a headers
// array, a body string, ...). Byte length (not character length) via
// Buffer.byteLength, since the threshold is meant to bound how many actual
// bytes a Mongo document holds — character length alone would undercount
// multi-byte UTF-8 text (accented text, emoji in a response body).
function shouldStoreInline(value, thresholdBytes = DEFAULT_INLINE_THRESHOLD_BYTES) {
  if (value === null || value === undefined) return true;
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.byteLength(serialized, 'utf8') <= thresholdBytes;
}

// Pure — caps how many console.log lines survive per test result, and how
// long each one can be, so a script that logs in a loop (or dumps one huge
// object) can't blow up a single AutomationTestResult the same way an
// uncapped request/response body could.
function truncateLogs(
  logs,
  { maxCount = DEFAULT_MAX_LOG_COUNT, maxLength = DEFAULT_MAX_LOG_LENGTH } = {},
) {
  if (!Array.isArray(logs)) return [];
  return logs.slice(0, maxCount).map((line) => {
    const text = typeof line === 'string' ? line : JSON.stringify(line);
    return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
  });
}

// Impure — the actual S3 upload when a value is over threshold. Returns
// the shape persisted on AutomationTestResult's Mixed fields: null (no
// value), { storage: 'inline', value } (kept as-is in Mongo), or
// { storage: 's3', url } (uploaded, only the URL kept in Mongo).
async function storeResultValue(value, { s3KeyPrefix, thresholdBytes } = {}) {
  if (value === null || value === undefined) return null;
  if (shouldStoreInline(value, thresholdBytes)) {
    return { storage: 'inline', value };
  }
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const key = `${s3KeyPrefix}-${Date.now()}.json`;
  const url = await s3Client.uploadObject(key, Buffer.from(serialized, 'utf8'), 'application/json');
  return { storage: 's3', url };
}

module.exports = {
  DEFAULT_INLINE_THRESHOLD_BYTES,
  DEFAULT_MAX_LOG_COUNT,
  DEFAULT_MAX_LOG_LENGTH,
  shouldStoreInline,
  truncateLogs,
  storeResultValue,
};
