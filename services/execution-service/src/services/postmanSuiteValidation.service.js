// Structural validation only (same philosophy as allureParser/newmanParser's
// isAllureResult/isNewmanReport) — we check the file "looks like" what it
// claims to be, not that every request inside it is well-formed. Semantic
// problems inside a malformed collection surface later, from Newman itself,
// when the Runner (Etapa 3) actually tries to execute it.
const COLLECTION_SCHEMA_PATTERN = /schema\.getpostman\.com\/json\/collection\/v2/;

function isValidPostmanCollection(json) {
  return Boolean(
    json &&
    typeof json === 'object' &&
    typeof json.info?.schema === 'string' &&
    COLLECTION_SCHEMA_PATTERN.test(json.info.schema) &&
    Array.isArray(json.item) &&
    json.item.length > 0,
  );
}

function isValidPostmanEnvironment(json) {
  return Boolean(json && typeof json === 'object' && Array.isArray(json.values));
}

function parseUploadedJson(file, label) {
  try {
    return JSON.parse(file.buffer.toString('utf8'));
  } catch (_err) {
    const err = new Error(`Invalid JSON in uploaded ${label} file "${file.originalname}"`);
    err.status = 400;
    throw err;
  }
}

// Throws (status 400) rather than returning a boolean — every call site
// wants "stop and tell the user what's wrong", not a value to branch on.
function validateCollectionFile(file) {
  const json = parseUploadedJson(file, 'collection');
  if (!isValidPostmanCollection(json)) {
    const err = new Error(
      `"${file.originalname}" doesn't look like a Postman Collection v2.1 export ` +
        '(missing/invalid info.schema, or no items)',
    );
    err.status = 400;
    throw err;
  }
  return json;
}

function validateEnvironmentFile(file) {
  const json = parseUploadedJson(file, 'environment');
  if (!isValidPostmanEnvironment(json)) {
    const err = new Error(
      `"${file.originalname}" doesn't look like a Postman Environment export (missing values[])`,
    );
    err.status = 400;
    throw err;
  }
  return json;
}

module.exports = {
  isValidPostmanCollection,
  isValidPostmanEnvironment,
  validateCollectionFile,
  validateEnvironmentFile,
};
