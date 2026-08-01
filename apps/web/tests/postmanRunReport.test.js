import { describe, test, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  buildPostmanRunReportData,
  buildPostmanRunHtml,
  sanitizeSuiteName,
} from '../src/utils/postmanRunReport';

const baseRun = {
  _id: 'run-1',
  projectId: 'proj-1',
  tool: 'newman',
  triggerType: 'manual',
  postmanSuiteId: 'suite-1',
  executedAt: '2026-01-01T00:00:00.000Z',
  totalTests: 1,
  passed: 1,
  failed: 0,
  broken: 0,
  skipped: 0,
  durationMs: 42,
};

describe('buildPostmanRunReportData', () => {
  test('normalizes run summary fields', () => {
    const data = buildPostmanRunReportData({ run: baseRun, testResults: [] });
    expect(data.run).toMatchObject({
      id: 'run-1',
      tool: 'newman',
      triggerType: 'manual',
      postmanSuiteId: 'suite-1',
      totalTests: 1,
      passed: 1,
    });
    expect(data.tests).toEqual([]);
  });

  test('sanitizes Unicode outside jsPDF WinAnsi support the same way the rest of the app does', () => {
    const data = buildPostmanRunReportData({
      run: baseRun,
      testResults: [
        {
          _id: 'atr-1',
          suiteName: 'Smoke API',
          testName: 'GET /health → 200 (≠ 500)',
          status: 'passed',
          durationMs: 12,
          method: 'GET',
          url: 'https://api.example.com/health',
          logs: ['[info] response ≠ expected, retrying →'],
        },
      ],
    });

    expect(data.tests).toHaveLength(1);
    expect(data.tests[0].testName).toBe('GET /health -> 200 (!= 500)');
    expect(data.tests[0].logs[0]).toBe('[info] response != expected, retrying ->');
  });

  test('keeps a small (inline) stored field as text, unwrapped from its storage envelope', () => {
    const data = buildPostmanRunReportData({
      run: baseRun,
      testResults: [
        {
          _id: 'atr-1',
          testName: 'GET /health',
          status: 'passed',
          durationMs: 12,
          requestHeaders: {
            storage: 'inline',
            value: [{ key: 'Accept', value: 'application/json' }],
          },
          responseBody: { storage: 'inline', value: '{"ok":true}' },
        },
      ],
    });

    const [test] = data.tests;
    expect(test.requestHeaders.truncated).toBe(false);
    expect(test.requestHeaders.text).toContain('Accept');
    expect(test.responseBody).toEqual({ truncated: false, url: null, text: '{"ok":true}' });
  });

  test('surfaces a large (S3-backed) stored field as a truncated pointer, not its content', () => {
    const data = buildPostmanRunReportData({
      run: baseRun,
      testResults: [
        {
          _id: 'atr-1',
          testName: 'GET /health',
          status: 'passed',
          durationMs: 12,
          responseBody: { storage: 's3', url: 'http://minio.local/bucket/large-body.json' },
        },
      ],
    });

    expect(data.tests[0].responseBody).toEqual({
      truncated: true,
      url: 'http://minio.local/bucket/large-body.json',
      text: null,
    });
  });

  test('sanitizes a per-test suiteName the same way the report title is sanitized, so a "Newman collection" fallback never leaks into a request title', () => {
    const data = buildPostmanRunReportData({
      run: baseRun,
      testResults: [
        {
          _id: 'atr-1',
          suiteName: 'Newman collection',
          testName: 'GET /health',
          status: 'passed',
          durationMs: 12,
        },
      ],
    });

    expect(data.tests[0].suiteName).toBeNull();
  });

  test('passes null fields through as null, and defaults missing logs to an empty array', () => {
    const data = buildPostmanRunReportData({
      run: baseRun,
      testResults: [
        {
          _id: 'atr-1',
          testName: 'GET /health',
          status: 'passed',
          durationMs: 12,
          requestBody: null,
        },
      ],
    });

    expect(data.tests[0].requestBody).toBeNull();
    expect(data.tests[0].logs).toEqual([]);
  });
});

// Minimal but real i18n-shaped labels — every key buildPostmanRunHtml reads
// off `labels`, matching what AutomationRunDetailPage.jsx actually passes
// (real translated strings, not placeholders), so a missing key would show
// up here the same way it would in the real export.
const htmlLabels = {
  truncatedNote: '… (truncado)',
  totalTestCases: 'Total',
  passed: 'Pasaron',
  failed: 'Fallaron',
  broken: 'Rotos',
  skipped: 'Omitidos',
  requestHeaders: 'Headers de la request',
  requestBody: 'Body de la request',
  responseHeaders: 'Headers de la respuesta',
  responseBody: 'Body de la respuesta',
  logs: 'Logs de consola',
  viewFullContent: 'Ver contenido completo',
  unnamedCollection: 'Colección sin nombre',
  noEnvironment: 'Sin entorno',
  reportExecutionTitle: 'Reporte de ejecución — {{suiteName}}',
  generatedOnTrigger: 'Generado el {{date}} · disparo {{trigger}}',
  exportedAsHtml: 'Exportado como HTML · QualiGuali',
  requestsExecutedNav: 'Requests ejecutados',
  environment: 'Entorno',
  generalResult: 'Resultado general',
  passRateDuration: '{{rate}}% de éxito · duración total {{duration}}',
  showingAllRequests: 'Mostrando los {{count}} requests.',
  showingFilteredRequests: 'Mostrando {{visible}} de {{total}} · {{status}}.',
  viewAllRequests: 'Ver todos',
  statusPillPassed: 'Pasó',
  statusPillFailed: 'Falló',
  statusPillBroken: 'Roto',
  statusPillSkipped: 'Omitido',
  footerBrand: 'QualiGuali · Ejecutor de Colecciones Postman',
  requestsCountDuration: '{{count}} request(s) · {{duration}}',
  triggerType_manual: 'Manual',
  triggerType_scheduled: 'Programado',
  triggerType_retry: 'Reintento',
};

function renderReportDom(html) {
  const dom = new JSDOM(html, { runScripts: 'dangerously' });
  return dom.window.document;
}

describe('buildPostmanRunHtml', () => {
  const run = {
    _id: 'run-1',
    projectId: 'proj-1',
    tool: 'newman',
    triggerType: 'manual',
    postmanSuiteId: 'suite-1',
    executedAt: '2026-01-01T09:00:00.000Z',
    totalTests: 3,
    passed: 1,
    failed: 1,
    broken: 1,
    skipped: 0,
    durationMs: 1500,
  };
  const testResults = [
    {
      _id: 't1',
      suiteName: 'Gestión de Proyectos',
      testName: 'Crear proyecto',
      status: 'passed',
      durationMs: 10,
      method: 'POST',
      url: 'http://localhost:4001/projects',
      responseStatus: 201,
      requestHeaders: {
        storage: 'inline',
        value: [{ key: 'Content-Type', value: 'application/json' }],
      },
      responseBody: { storage: 'inline', value: { project: { _id: '1' } } },
    },
    {
      _id: 't2',
      suiteName: 'Gestión de Proyectos',
      testName: 'Editar proyecto',
      status: 'failed',
      durationMs: 15,
      method: 'PATCH',
      url: 'http://localhost:4001/projects/1',
      responseStatus: 401,
      errorMessage: 'Invalid token',
    },
    {
      _id: 't3',
      suiteName: 'Gestión de Proyectos',
      testName: 'Eliminar proyecto',
      status: 'broken',
      durationMs: null,
      method: 'DELETE',
      url: 'http://localhost:4001/projects/1',
      responseStatus: null,
      errorMessage: 'ECONNREFUSED',
    },
  ];

  function buildDom(overrides = {}) {
    const data = buildPostmanRunReportData({ run, testResults, labels: htmlLabels });
    const html = buildPostmanRunHtml({
      data,
      labels: htmlLabels,
      meta: {
        suiteName: 'Gestión de Proyectos (CRUD)',
        projectName: 'QualiGuali',
        environmentName: 'Local',
      },
      ...overrides,
    });
    return { html, doc: renderReportDom(html) };
  }

  test('shows the real Suite name in the document title and main heading, never "Newman"', () => {
    const { doc } = buildDom();

    expect(doc.title).toContain('Gestión de Proyectos (CRUD)');
    expect(doc.getElementById('main-title').textContent).toContain('Gestión de Proyectos (CRUD)');
    expect(doc.getElementById('sidebar-suite-name').textContent).toBe(
      'Gestión de Proyectos (CRUD)',
    );
  });

  test('never renders the word "Newman" anywhere in visible text', () => {
    const { doc } = buildDom();
    expect(doc.body.textContent).not.toMatch(/newman/i);
    expect(doc.title).not.toMatch(/newman/i);
  });

  test('falls back to the "unnamed collection" label instead of a Newman-branded name', () => {
    const { doc } = buildDom({ meta: { suiteName: 'Newman collection' } });
    expect(doc.getElementById('sidebar-suite-name').textContent).toBe('Colección sin nombre');
    expect(doc.body.textContent).not.toMatch(/newman/i);
  });

  test('each test card carries the correct data-status attribute', () => {
    const { doc } = buildDom();
    const statuses = Array.from(doc.querySelectorAll('#tests-container .test')).map(
      (el) => el.dataset.status,
    );
    expect(statuses).toEqual(['passed', 'failed', 'broken']);
  });

  test('request/response detail blocks are collapsed by default', () => {
    const { doc } = buildDom();
    const detailsBlocks = Array.from(doc.querySelectorAll('details.data-block'));
    expect(detailsBlocks.length).toBeGreaterThan(0);
    expect(detailsBlocks.every((el) => el.open === false)).toBe(true);
  });

  test('clicking a KPI filters the visible test cards by status', () => {
    const { doc } = buildDom();
    const failedKpi = Array.from(doc.querySelectorAll('.kpi')).find((btn) =>
      btn.className.includes('failed'),
    );
    failedKpi.click();

    const visible = Array.from(doc.querySelectorAll('#tests-container .test')).filter(
      (el) => !el.classList.contains('hidden-by-filter'),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0].dataset.status).toBe('failed');
  });

  test('never shows a "Newman collection" per-test suiteName prefix on an individual request title', () => {
    const newmanBrandedResults = testResults.map((testResult) => ({
      ...testResult,
      suiteName: 'Newman collection',
    }));
    const data = buildPostmanRunReportData({
      run,
      testResults: newmanBrandedResults,
      labels: htmlLabels,
    });
    const html = buildPostmanRunHtml({
      data,
      labels: htmlLabels,
      meta: { suiteName: 'Gestión de Proyectos (CRUD)', projectName: 'QualiGuali', environmentName: 'Local' },
    });

    expect(html).not.toMatch(/newman/i);
    const doc = renderReportDom(html);
    const firstCardTitle = doc.querySelector('#tests-container .test h3').textContent;
    expect(firstCardTitle).toBe('Crear proyecto');
  });

  test('a value containing "</script>" cannot break out of the embedded data script', () => {
    const maliciousResults = [
      {
        _id: 't1',
        testName: 'Crear proyecto',
        status: 'failed',
        durationMs: 10,
        errorMessage: '<script>alert(1)</script>',
      },
    ];
    const data = buildPostmanRunReportData({
      run,
      testResults: maliciousResults,
      labels: htmlLabels,
    });
    const html = buildPostmanRunHtml({
      data,
      labels: htmlLabels,
      meta: { suiteName: 'Smoke', projectName: 'QualiGuali', environmentName: null },
    });

    // Exactly one <script> tag — the report's own — survives; the payload
    // never gets to open a second one.
    expect(html.match(/<script>/g)).toHaveLength(1);

    const doc = renderReportDom(html);
    expect(doc.querySelector('.error-box').textContent).toBe('<script>alert(1)</script>');
  });
});

describe('sanitizeSuiteName', () => {
  test('passes a real name through unchanged', () => {
    expect(sanitizeSuiteName('Gestión de Proyectos', 'fallback')).toBe('Gestión de Proyectos');
  });

  test('replaces a missing name with the fallback', () => {
    expect(sanitizeSuiteName(null, 'fallback')).toBe('fallback');
    expect(sanitizeSuiteName('', 'fallback')).toBe('fallback');
  });

  test('replaces a Newman-branded fallback name (any casing) with the fallback', () => {
    expect(sanitizeSuiteName('Newman collection', 'fallback')).toBe('fallback');
    expect(sanitizeSuiteName('NEWMAN', 'fallback')).toBe('fallback');
  });
});
