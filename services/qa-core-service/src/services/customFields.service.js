// Validates TestCase.customFields against its TestCaseTemplate.fields
// definition ([{key,label,type,required,options?}]). Unknown extra keys in
// customFields are ignored — the template only constrains its own fields.
function validateCustomFields(templateFields = [], customFields = {}) {
  const errors = [];

  templateFields.forEach((field) => {
    const value = customFields[field.key];
    const isMissing = value === undefined || value === null || value === '';

    if (field.required && isMissing) {
      errors.push(`Missing required field "${field.key}"`);
      return;
    }

    if (isMissing) return;

    if (field.type === 'text' && typeof value !== 'string') {
      errors.push(`Field "${field.key}" must be a string`);
    }

    if (field.type === 'number' && typeof value !== 'number') {
      errors.push(`Field "${field.key}" must be a number`);
    }

    if (field.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`Field "${field.key}" must be a boolean`);
    }

    if (field.type === 'select' && Array.isArray(field.options) && !field.options.includes(value)) {
      errors.push(`Field "${field.key}" must be one of: ${field.options.join(', ')}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

module.exports = { validateCustomFields };
