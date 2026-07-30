const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  QA_ENGINEER: 'qa_engineer',
});

const ROLE_VALUES = Object.values(ROLES);

module.exports = { ROLES, ROLE_VALUES };
