const {
  isValidPostmanCollection,
  isValidPostmanEnvironment,
  validateCollectionFile,
  validateEnvironmentFile,
} = require('../../src/services/postmanSuiteValidation.service');

function jsonFile(originalname, body) {
  return { originalname, buffer: Buffer.from(JSON.stringify(body)) };
}

describe('isValidPostmanCollection', () => {
  test('accepts a v2.1 collection with at least one item', () => {
    expect(
      isValidPostmanCollection({
        info: { schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        item: [{ name: 'GET /health' }],
      }),
    ).toBe(true);
  });

  test('accepts a v2.0 collection too (older exports still say v2)', () => {
    expect(
      isValidPostmanCollection({
        info: { schema: 'https://schema.getpostman.com/json/collection/v2.0.0/collection.json' },
        item: [{ name: 'GET /health' }],
      }),
    ).toBe(true);
  });

  test('rejects a file with no info.schema', () => {
    expect(isValidPostmanCollection({ item: [{ name: 'x' }] })).toBe(false);
  });

  test('rejects a file with an unrelated schema URL', () => {
    expect(
      isValidPostmanCollection({
        info: { schema: 'https://schema.getpostman.com/json/environment/v2.1.0/environment.json' },
        item: [{ name: 'x' }],
      }),
    ).toBe(false);
  });

  test('rejects a collection with no items', () => {
    expect(
      isValidPostmanCollection({
        info: { schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
        item: [],
      }),
    ).toBe(false);
  });

  test('rejects null/non-object input', () => {
    expect(isValidPostmanCollection(null)).toBe(false);
    expect(isValidPostmanCollection('not an object')).toBe(false);
  });
});

describe('isValidPostmanEnvironment', () => {
  test('accepts an environment with a values array', () => {
    expect(isValidPostmanEnvironment({ values: [{ key: 'baseUrl', value: 'x' }] })).toBe(true);
  });

  test('accepts an empty values array', () => {
    expect(isValidPostmanEnvironment({ values: [] })).toBe(true);
  });

  test('rejects a file with no values array', () => {
    expect(isValidPostmanEnvironment({ name: 'x' })).toBe(false);
  });

  test('rejects null/non-object input', () => {
    expect(isValidPostmanEnvironment(null)).toBe(false);
  });
});

describe('validateCollectionFile', () => {
  test('returns the parsed JSON for a valid collection', () => {
    const file = jsonFile('collection.json', {
      info: { schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [{ name: 'GET /health' }],
    });
    expect(validateCollectionFile(file)).toMatchObject({ item: [{ name: 'GET /health' }] });
  });

  test('throws a 400 error for invalid JSON', () => {
    const file = { originalname: 'collection.json', buffer: Buffer.from('not json') };
    expect(() => validateCollectionFile(file)).toThrow(/Invalid JSON/);
  });

  test('throws a 400 error for a structurally invalid collection', () => {
    const file = jsonFile('collection.json', { name: 'nope' });
    try {
      validateCollectionFile(file);
      throw new Error('expected validateCollectionFile to throw');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/doesn't look like a Postman Collection/);
    }
  });
});

describe('validateEnvironmentFile', () => {
  test('returns the parsed JSON for a valid environment', () => {
    const file = jsonFile('environment.json', { values: [{ key: 'baseUrl', value: 'x' }] });
    expect(validateEnvironmentFile(file)).toMatchObject({
      values: [{ key: 'baseUrl', value: 'x' }],
    });
  });

  test('throws a 400 error for a structurally invalid environment', () => {
    const file = jsonFile('environment.json', { name: 'nope' });
    try {
      validateEnvironmentFile(file);
      throw new Error('expected validateEnvironmentFile to throw');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/doesn't look like a Postman Environment/);
    }
  });
});
