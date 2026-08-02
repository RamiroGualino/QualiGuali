// Etapa 10 (docs/data-testing/etapa-10-e2e-playwright.md): flujo completo
// del módulo Test de Datos de punta a punta — sin mockear nada, API real.
//
// Runs against a REAL stack (backend services + the Vite dev server), not
// mocks — see apps/web/README.md "E2E" for how to run it. Requires a Super
// Admin already seeded in auth-service (services/auth-service/README.md's
// `pnpm seed`) — same as fullFlow.spec.js. There is no dedicated "QA
// Engineer" test user seeded anywhere in the repo, and data-testing-service
// (like every other service except auth-service/projects-service/
// reports-service-internal) gates only on a valid JWT, not on role
// (`createAuthenticate`, no `requireRole` — see etapa-4-api-suites.md's own
// permisos note), so the seeded Super Admin can do everything this spec
// needs. Creates its own fresh Project inline (same reasoning as
// fullFlow.spec.js: no assumption about pre-existing data, so the spec
// stays self-contained and repeatable).
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'data-testing');

const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL || 'super.admin@qualiguali.local';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD || 'change-me';

test('Test de Datos: crear Suite -> correr Corrida -> ver detalle -> descargar PDF -> ver en el historial', async ({
  page,
}) => {
  // El timeout global de playwright.config.js (30s) está pensado para
  // fullFlow.spec.js (6 pasos simples) — este flujo tiene 8 pasos más
  // pesados (2 uploads de archivo, 4 expectativas agregadas una por una,
  // una Corrida real contra el motor de evaluación, descarga de PDF), así
  // que necesita más margen.
  test.setTimeout(120_000);

  const projectName = `E2E data-testing ${Date.now()}`;
  const suiteName = `Suite E2E ${Date.now()}`;

  // Fuerza inglés para que `selectOption({ label })` (que no soporta regex,
  // a diferencia de getByLabel/getByRole/getByText) pueda usar el texto
  // literal exacto sin depender de qué idioma detecte i18n por default
  // (navigator.language) en el entorno donde corra el spec.
  await page.addInitScript(() => window.localStorage.setItem('qualiguali.language', 'en'));

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

    // Corrección: no hay más un botón "Abrir espacio" por fila — desde que
    // "el project switcher del header es ahora el único lugar para abrir/
    // cambiar de proyecto" (comentario propio de ProjectManagementPage.jsx),
    // entrar a un proyecto es elegirlo en el <select> de ProjectSwitcher
    // (Topbar), no una acción de fila en ProjectsPage.
    await page.locator('header').getByRole('combobox').selectOption({ label: projectName });

    await expect(page).toHaveURL(/\/projects\/[^/]+\/home$/);
    projectId = page.url().match(/projects\/([^/]+)/)[1];
  });

  await test.step('navigate to Test de Datos -> Suites', async () => {
    await page.getByRole('link', { name: /test de datos|data testing/i }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/data-testing/suites$`));
  });

  await test.step('create a Suite covering the 3 expectation scopes', async () => {
    await page.getByRole('button', { name: /nueva suite|new suite/i }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/data-testing/suites/new$`));

    await page.getByLabel(/^(nombre|name)/i).fill(suiteName);

    // Reference file -> detected columns populate the ExpectationSelector's
    // column picker (REQ-DT-002).
    await page.locator('[data-testid="dropzone-input"]').first().setInputFiles(
      path.join(FIXTURES_DIR, 'reference.xlsx'),
    );
    await expect(page.getByText('dni')).toBeVisible();
    await expect(page.getByText('nombre')).toBeVisible();
    await expect(page.getByText('edad')).toBeVisible();
    await expect(page.getByText('email')).toBeVisible();

    // Identifier column, so failed records later show a business id, not
    // just a row number (BR-DT-001/006).
    await page.getByLabel(/columna identificadora|business identifier/i).fill('dni');

    // 1) Tabla — "Cantidad de filas = X" (run-with-failures.xlsx has 4 data
    // rows) — passes.
    await page.getByLabel(/tipo de expectativa|expectation type/i).selectOption({ label: 'Row count = X' });
    await page.getByLabel(/cantidad|count/i).fill('4');
    await page.getByRole('button', { name: /agregar expectativa|add expectation/i }).click();

    // 2) Columna — "Entre X e Y" sobre "edad" (18-65) — Carlos Ruiz (90)
    // hace fallar esta expectativa a propósito.
    await page.getByRole('tab', { name: /^columna$|^column$/i }).click();
    await page.getByLabel(/^columna$|^column$/i).selectOption('edad');
    await page.getByLabel(/tipo de expectativa|expectation type/i).selectOption({ label: 'Between X and Y' });
    await page.getByLabel(/mínimo|minimum/i).fill('18');
    await page.getByLabel(/máximo|maximum/i).fill('65');
    await page.getByRole('button', { name: /agregar expectativa|add expectation/i }).click();

    // 3) Multicolumna — combinación (nombre, email) única por fila — pasa
    // (las 4 filas del fixture son personas distintas).
    await page.getByRole('tab', { name: /multicolumn/i }).click();
    await page
      .getByLabel(/tipo de expectativa|expectation type/i)
      .selectOption({ label: 'Combination of columns is unique per row' });
    await page.getByRole('checkbox', { name: 'nombre' }).check();
    await page.getByRole('checkbox', { name: 'email' }).check();
    await page.getByRole('button', { name: /agregar expectativa|add expectation/i }).click();

    // Etapa 6.1 (docs/data-testing/etapa-6.1-Rediseño UX.md): la lista plana
    // de pastillas se reemplazó por ExpectationList, agrupada por
    // columna/Tabla/Multicolumna — ya no hay un único role="list" "Expectations"
    // para contar listitems; el título con el contador ya alcanza.
    await expect(page.getByText('Configured expectations (3)')).toBeVisible();

    await page.getByRole('button', { name: /^(guardar|save)$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/data-testing/suites$`));
    await expect(page.getByText(suiteName)).toBeVisible();
  });

  let runId;

  await test.step('start a Corrida: fuzzy-match confirmation + intentional failure', async () => {
    // "Nueva Corrida"/"New Run" vive en ExpectationRunsPage (/data-testing/
    // runs), no en la de Suites donde nos dejó el paso anterior — hay que
    // cambiar de tab primero.
    await page.getByRole('link', { name: /^corridas$|^runs$/i }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/data-testing/runs$`));

    await page.getByRole('button', { name: /nueva corrida|new run/i }).click();

    await page.getByLabel(/^suite/i).fill(suiteName);
    await page.locator('[data-testid="dropzone-input"]').first().setInputFiles(
      path.join(FIXTURES_DIR, 'run-with-failures.xlsx'),
    );

    // "dni"/"edad"/"email" matched exact; "nombre" matched "nombres" fuzzy
    // (BR-DT-002) — needs an explicit confirmation click.
    const mappingList = page.getByRole('list', { name: /column mapping|mapeo de columnas/i });
    await expect(mappingList).toBeVisible();
    const nombreRow = mappingList.getByRole('listitem', { name: 'nombre' });
    await expect(nombreRow.getByText('nombres')).toBeVisible();
    await nombreRow.getByRole('button', { name: /confirm|confirmar/i }).click();

    await page.getByRole('button', { name: /^(ejecutar|run)$/i }).click();

    // No auto-navigation to the detail page (ExpectationRunsPage's
    // handleRunCreated just closes the modal + refreshes the list) — the
    // new run shows up in the history table.
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const row = page.locator('tr', { hasText: 'run-with-failures.xlsx' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /view|ver/i }).click();

    await expect(page).toHaveURL(
      new RegExp(`/projects/${projectId}/data-testing/runs/[^/]+$`),
    );
    runId = page.url().match(/runs\/([^/]+)$/)[1];
  });

  await test.step('verify the run detail: coverage + pass/fail results + affected record', async () => {
    // Etapa 11 (docs/data-testing/etapa-11-rediseno-reporte-ejecucion.md):
    // Cobertura de Columnas ya no es una <table> — es una lista compacta con
    // ícono (ColumnCoverageCard). Las 4 columnas esperadas fueron
    // encontradas (incluso "nombre", vía el fuzzy match confirmado arriba).
    // Acotado al card (por su heading): el nombre de columna también
    // aparece en el gráfico de calidad por columna y en cada RuleResultCard.
    const coverageCard = page.getByRole('heading', { name: /column coverage|cobertura de columnas/i }).locator('..');
    for (const column of ['dni', 'nombre', 'edad', 'email']) {
      await expect(coverageCard.getByText(column, { exact: true })).toBeVisible();
    }

    // Resultado por Expectativa: cada regla es ahora una card colapsada por
    // defecto (RuleResultCard) — toda la fila es un <button>, así que su
    // nombre accesible incluye el badge de estado. Al menos una Aprobada y
    // una Fallida.
    await expect(page.getByRole('button', { name: /passed|aprobada/i }).first()).toBeVisible();
    const failedCard = page.getByRole('button', { name: /failed|fallida/i }).first();
    await expect(failedCard).toBeVisible();

    // La regla fallada (edad entre 18-65) sólo revela el businessId (dni)
    // del registro afectado, Carlos Ruiz -> 1004 (BR-DT-001/006), al
    // expandir la card — el detalle no se carga en el DOM por defecto
    // (punto 9 del rediseño, "resumen primero, detalle después").
    await failedCard.click();
    await expect(page.getByText('1004')).toBeVisible();
  });

  await test.step('download the PDF report', async () => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /descargar reporte|download report/i }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`corrida-${runId}.pdf`);
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
  });

  await test.step('go back to the Corridas list and confirm the new run is there', async () => {
    // Corrección: ExpectationRunDetailPage no tiene el Tabs
    // Suites/Corridas — sólo un BackButton (PageHeader's `leading`), a
    // diferencia de ExpectationRunsPage/ExpectationSuitesPage que sí lo
    // tienen. "Volver" usa navigate(-1), que aterriza exactamente en el
    // listado de Corridas del que salimos para entrar acá.
    await page.getByRole('button', { name: /^(volver|back)/i }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/data-testing/runs$`));
    await expect(page.locator('tr', { hasText: 'run-with-failures.xlsx' })).toBeVisible();
  });
});
