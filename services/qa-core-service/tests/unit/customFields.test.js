const { validateCustomFields } = require('../../src/services/customFields.service');

describe('validateCustomFields', () => {
  const fields = [
    { key: 'browser', label: 'Browser', type: 'text', required: true },
    { key: 'retries', label: 'Retries', type: 'number', required: false },
    {
      key: 'env',
      label: 'Environment',
      type: 'select',
      required: true,
      options: ['qa', 'staging'],
    },
  ];

  test('passes when all required fields are present and correctly typed', () => {
    const result = validateCustomFields(fields, { browser: 'chrome', env: 'qa' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('fails when a required field is missing', () => {
    const result = validateCustomFields(fields, { env: 'qa' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/browser/);
  });

  test('fails when a select field value is not among its options', () => {
    const result = validateCustomFields(fields, { browser: 'chrome', env: 'production' });
    expect(result.valid).toBe(false);
  });

  test('fails when a number field receives a non-number', () => {
    const result = validateCustomFields(fields, {
      browser: 'chrome',
      env: 'qa',
      retries: 'three',
    });
    expect(result.valid).toBe(false);
  });

  test('ignores extra keys not defined in the template', () => {
    const result = validateCustomFields(fields, { browser: 'chrome', env: 'qa', extra: true });
    expect(result.valid).toBe(true);
  });

  test('passes with no template fields at all', () => {
    const result = validateCustomFields([], { anything: 'goes' });
    expect(result.valid).toBe(true);
  });
});
