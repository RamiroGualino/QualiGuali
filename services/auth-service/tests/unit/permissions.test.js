const { canRegister, REGISTERABLE_ROLES } = require('../../src/utils/permissions');
const { ROLES } = require('@qualiguali/shared');

describe('canRegister', () => {
  test('a Super Admin can create an Admin', () => {
    expect(canRegister(ROLES.SUPER_ADMIN, ROLES.ADMIN)).toBe(true);
  });

  test('a Super Admin can create a QA Engineer', () => {
    expect(canRegister(ROLES.SUPER_ADMIN, ROLES.QA_ENGINEER)).toBe(true);
  });

  test('a Super Admin cannot create another Super Admin', () => {
    expect(canRegister(ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN)).toBe(false);
  });

  test('an Admin cannot create anyone', () => {
    expect(canRegister(ROLES.ADMIN, ROLES.QA_ENGINEER)).toBe(false);
    expect(canRegister(ROLES.ADMIN, ROLES.ADMIN)).toBe(false);
  });

  test('a QA Engineer cannot create anyone', () => {
    expect(canRegister(ROLES.QA_ENGINEER, ROLES.QA_ENGINEER)).toBe(false);
  });

  test('rejects an unknown or missing target role', () => {
    expect(canRegister(ROLES.SUPER_ADMIN, 'hacker')).toBe(false);
    expect(canRegister(ROLES.SUPER_ADMIN, undefined)).toBe(false);
  });

  test('rejects a missing actor role', () => {
    expect(canRegister(undefined, ROLES.QA_ENGINEER)).toBe(false);
  });

  test('REGISTERABLE_ROLES only exposes admin and qa_engineer', () => {
    expect(REGISTERABLE_ROLES).toEqual([ROLES.ADMIN, ROLES.QA_ENGINEER]);
  });
});
