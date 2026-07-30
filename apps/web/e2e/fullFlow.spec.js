// Full flow required by the Parte 7 prompt: login -> crear proyecto ->
// crear caso -> crear ciclo -> ejecutar -> ver en dashboard.
//
// Runs against a REAL stack (docker-compose backend services + the Vite dev
// server), not mocks — see apps/web/README.md "E2E" for how to run it.
// Requires a Super Admin already seeded in auth-service
// (services/auth-service/README.md's `pnpm seed`).
import { test, expect } from '@playwright/test';

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL || 'super.admin@qualiguali.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD || 'change-me';

test('login -> create project -> create test case -> create cycle -> execute -> view dashboard', async ({
  page,
}) => {
  const projectName = `E2E project ${Date.now()}`;

  await test.step('login', async () => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(SUPER_ADMIN_EMAIL);
    await page.getByLabel(/contraseña|password/i).fill(SUPER_ADMIN_PASSWORD);
    await page.getByRole('button', { name: /ingresar|sign in/i }).click();
    await expect(page).toHaveURL(/\/projects$/);
  });

  let projectId;

  await test.step('create a project', async () => {
    await page.getByRole('button', { name: /nuevo proyecto|new project/i }).click();
    await page.getByLabel(/^(nombre|name)/i).fill(projectName);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(crear|create)$/i })
      .click();

    const row = page.locator('tr', { hasText: projectName });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /abrir espacio|open workspace/i }).click();

    await expect(page).toHaveURL(/\/projects\/[^/]+\/modules$/);
    projectId = page.url().match(/projects\/([^/]+)/)[1];
  });

  await test.step('create a test case (using the project default template)', async () => {
    await page.goto(`/projects/${projectId}/test-cases`);
    await page.getByRole('button', { name: /nuevo caso|new test case/i }).click();
    await page.getByLabel(/^(título|title)/i).fill('Login works');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(crear|create)$/i })
      .click();
    await expect(page.getByText(/TC-\d+/)).toBeVisible();
  });

  await test.step('create a test plan with that test case', async () => {
    await page.goto(`/projects/${projectId}/test-plans`);
    await page.getByRole('button', { name: /nuevo plan|new test plan/i }).click();
    await page.getByLabel(/^(nombre|name)/i).fill('E2E plan');
    await page.getByText('Login works').locator('..').getByRole('checkbox').check();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(crear|create)$/i })
      .click();

    const row = page.locator('tr', { hasText: 'E2E plan' });
    await expect(row).toBeVisible();
  });

  let cycleId;

  await test.step('create an execution cycle from the plan', async () => {
    await page.goto(`/projects/${projectId}/execution-cycles`);
    await page.getByRole('button', { name: /nuevo ciclo|new cycle/i }).click();
    await page.getByLabel(/^(nombre|name)/i).fill('E2E cycle');
    await page.getByLabel(/plan de prueba|test plan/i).selectOption({ label: 'E2E plan' });
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^(crear|create)$/i })
      .click();

    const row = page.locator('tr', { hasText: 'E2E cycle' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /ver ejecuciones|view executions/i }).click();

    await expect(page).toHaveURL(/\/execution-cycles\/[^/]+$/);
    cycleId = page.url().match(/execution-cycles\/([^/]+)/)[1];
  });

  await test.step('mark the execution as pass', async () => {
    await page.getByRole('button', { name: /^(pasó|pass)$/i }).click();
    await expect(page.getByText(/^(pasó|pass)$/i).first()).toBeVisible();
  });

  await test.step('view the cycle in the reports dashboard', async () => {
    await page.goto(`/projects/${projectId}/reports/${cycleId}`);
    await expect(page.getByText(/^1\/1$/)).toBeVisible();
  });
});
