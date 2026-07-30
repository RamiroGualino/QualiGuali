const SENSITIVE_KEYS = new Set(['password', 'passwordhash', 'token', 'authorization']);

function redact(meta = {}) {
  const clean = { ...meta };
  for (const key of Object.keys(clean)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    }
  }
  return clean;
}

function log(level, message, meta) {
  const entry = {
    level,
    message,
    ...redact(meta),
    timestamp: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

const logger = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};

module.exports = logger;
