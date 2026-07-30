#!/usr/bin/env node
/* eslint-disable no-console */
// Manual smoke test for the Parte 2 + Parte 3 flows, against REAL running
// services (not mocked) — proves the synchronous cross-service HTTP
// validation (projects-service <-> qa-core-service <-> execution-service)
// and the S3/MinIO evidence upload actually work end to end.
//
// Usage:
//   docker-compose up -d
//   AUTH_URL=http://localhost:4000 PROJECTS_URL=http://localhost:4001 \
//   QA_CORE_URL=http://localhost:4002 EXECUTION_URL=http://localhost:4003 \
//   node scripts/e2e-smoke.js
//
// Requires a Super Admin already seeded in auth-service (see
// services/auth-service/README.md) so this script can log in and create an
// Admin to drive the rest of the flow.

const AUTH_URL = process.env.AUTH_URL || 'http://localhost:4000';
const PROJECTS_URL = process.env.PROJECTS_URL || 'http://localhost:4001';
const QA_CORE_URL = process.env.QA_CORE_URL || 'http://localhost:4002';
const EXECUTION_URL = process.env.EXECUTION_URL || 'http://localhost:4003';
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'super.admin@qualiguali.local';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'change-me';

async function call(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${options.method || 'GET'} ${url} -> ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

// No Content-Type header here — fetch sets the multipart boundary itself
// when the body is a FormData instance.
async function callMultipart(url, { headers, formData }) {
  const res = await fetch(url, { method: 'POST', headers, body: formData });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`POST ${url} -> ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  console.log('1. Login as Super Admin...');
  const { token: superAdminToken } = await call(`${AUTH_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD }),
  });

  console.log('2. Create an Admin...');
  const adminEmail = `admin.e2e.${Date.now()}@qualiguali.local`;
  await call(`${AUTH_URL}/auth/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${superAdminToken}` },
    body: JSON.stringify({ email: adminEmail, password: 'Password123!', role: 'admin' }),
  });
  const { token } = await call(`${AUTH_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email: adminEmail, password: 'Password123!' }),
  });
  const authHeader = { Authorization: `Bearer ${token}` };

  console.log('3. Create a project...');
  const { project } = await call(`${PROJECTS_URL}/projects`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ name: `E2E smoke ${Date.now()}` }),
  });

  console.log('4. Create a module...');
  const { module: functionalModule } = await call(
    `${PROJECTS_URL}/projects/${project._id}/modules`,
    {
      method: 'POST',
      headers: authHeader,
      body: JSON.stringify({ name: 'Checkout' }),
    },
  );

  console.log('5. Create a requirement (validated against real projects-service)...');
  const { requirement } = await call(`${QA_CORE_URL}/requirements`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      projectId: project._id,
      moduleId: functionalModule._id,
      title: 'User can pay with credit card',
    }),
  });

  console.log('5b. Create a test suite under the requirement...');
  const { testSuite } = await call(`${QA_CORE_URL}/test-suites`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      projectId: project._id,
      requirementId: requirement._id,
      name: 'Credit card payments',
    }),
  });

  console.log('6. Create a test case template...');
  const { template } = await call(`${QA_CORE_URL}/test-case-templates`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      projectId: project._id,
      name: 'Payments',
      fields: [{ key: 'amount', label: 'Amount', type: 'number', required: true }],
    }),
  });

  console.log('7. Create a test case in the suite, with customFields...');
  const { testCase } = await call(`${QA_CORE_URL}/test-cases`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      projectId: project._id,
      moduleId: functionalModule._id,
      suiteId: testSuite._id,
      templateId: template._id,
      title: 'Pay with valid credit card',
      customFields: { amount: 100 },
    }),
  });

  console.log('8. Create a test plan and add the test case to it...');
  const { testPlan } = await call(`${QA_CORE_URL}/test-plans`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ projectId: project._id, name: 'Release 1.0 regression' }),
  });
  await call(`${QA_CORE_URL}/test-plans/${testPlan._id}/test-cases`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ testCaseIds: [testCase._id] }),
  });

  console.log('9. Create an execution cycle from the test plan (bootstraps Executions)...');
  const { executionCycle } = await call(`${EXECUTION_URL}/execution-cycles`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      projectId: project._id,
      testPlanId: testPlan._id,
      name: 'Release 1.0 cycle',
    }),
  });

  console.log('10. List the precreated executions...');
  const { executions } = await call(
    `${EXECUTION_URL}/execution-cycles/${executionCycle._id}/executions`,
    { headers: authHeader },
  );
  const [execution] = executions;

  console.log('11. Mark the execution as pass...');
  await call(`${EXECUTION_URL}/executions/${execution._id}`, {
    method: 'PATCH',
    headers: authHeader,
    body: JSON.stringify({ status: 'pass', comments: 'Looks good' }),
  });

  console.log('12. Attach evidence (uploaded to real S3/MinIO)...');
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([Buffer.from('fake screenshot bytes')], { type: 'image/png' }),
    'proof.png',
  );
  const { evidence } = await callMultipart(
    `${EXECUTION_URL}/executions/${execution._id}/evidence`,
    {
      headers: authHeader,
      formData,
    },
  );

  console.log('13. Close the cycle (publishes CycleFinished — check the service logs)...');
  const { executionCycle: closedCycle } = await call(
    `${EXECUTION_URL}/execution-cycles/${executionCycle._id}/close`,
    { method: 'POST', headers: authHeader, body: JSON.stringify({ force: true }) },
  );

  console.log('\n✔ Full flow completed successfully:');
  console.log({
    project: project._id,
    module: functionalModule._id,
    requirement: `${requirement.code} (${requirement._id})`,
    template: template._id,
    testCase: `${testCase.code} (${testCase._id})`,
    testPlan: testPlan._id,
    executionCycle: `${closedCycle._id} (${closedCycle.status})`,
    execution: `${execution._id} (pass)`,
    evidence: evidence.fileUrl,
  });
}

main().catch((err) => {
  console.error('\n✘ E2E smoke test failed:', err.message);
  process.exit(1);
});
