import { safeText } from './reportPdf';

// Etapa 5 (docs/postman-runner/etapa-5-sistema-de-reportes.md): a single
// data-builder shared by both the PDF and HTML exports of a Postman Suite
// run's detail view — "un único fetch, dos formatos de salida" — so the two
// exported documents always agree on what they show, and so the WinAnsi
// sanitization reportPdf.js's other exports already apply gets applied
// exactly once, here, rather than duplicated (or forgotten) in each format.
//
// AutomationTestResult's requestHeaders/requestBody/responseHeaders/
// responseBody are each either null, { storage: 'inline', value } (small
// enough to have been kept in Mongo), or { storage: 's3', url } (uploaded
// past the 20KB threshold — see execution-service's resultStorage.service.js)
// — normalized here into a single shape both exports can render without
// knowing about that storage decision themselves.
function formatStoredField(field, truncationSuffix) {
  if (!field) return null;
  if (field.storage === 's3') {
    return { truncated: true, url: field.url, text: null };
  }
  const { value } = field;
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { truncated: false, url: null, text: safeText(raw, undefined, truncationSuffix) };
}

// Pure — no I/O, no DOM. This is the ONLY place a Postman Suite run's raw
// AutomationRun/AutomationTestResult documents get turned into export-ready
// data; buildPostmanRunPdf and buildPostmanRunHtml both consume its output
// as-is. Adding a visual redesign to one export (see buildPostmanRunHtml
// below) is a rendering change, not a reason to touch this function.
export function buildPostmanRunReportData({ run, testResults, labels = {} }) {
  const truncationSuffix = labels.truncatedNote;

  const tests = (testResults || []).map((testResult) => {
    // newmanParser.js stamps every AutomationTestResult in a run with the
    // same raw collection name — including its own "Newman collection"
    // fallback when the uploaded/generated collection had no info.name.
    // Sanitized here (once, at the source) so no per-test title anywhere
    // downstream (HTML cards, PDF pages, the on-page table) can leak that
    // fallback the way the top-level report title already guards against.
    const cleanSuiteName = sanitizeSuiteName(testResult.suiteName, null);
    return {
      id: testResult._id,
      suiteName: cleanSuiteName ? safeText(cleanSuiteName, undefined, truncationSuffix) : null,
      testName: safeText(testResult.testName, undefined, truncationSuffix),
      status: testResult.status,
      durationMs: testResult.durationMs,
      method: testResult.method || null,
      url: testResult.url || null,
      responseStatus: testResult.responseStatus ?? null,
      errorMessage: testResult.errorMessage
        ? safeText(testResult.errorMessage, undefined, truncationSuffix)
        : null,
      requestHeaders: formatStoredField(testResult.requestHeaders, truncationSuffix),
      requestBody: formatStoredField(testResult.requestBody, truncationSuffix),
      responseHeaders: formatStoredField(testResult.responseHeaders, truncationSuffix),
      responseBody: formatStoredField(testResult.responseBody, truncationSuffix),
      logs: (testResult.logs || []).map((line) => safeText(line, undefined, truncationSuffix)),
    };
  });

  return {
    run: {
      id: run._id,
      projectId: run.projectId,
      tool: run.tool,
      triggerType: run.triggerType || 'manual',
      postmanSuiteId: run.postmanSuiteId || null,
      executedAt: run.executedAt,
      totalTests: run.totalTests,
      passed: run.passed,
      failed: run.failed,
      broken: run.broken,
      skipped: run.skipped,
      durationMs: run.durationMs,
    },
    tests,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The literal word "Newman" must never surface as a report title (the tool
// is an implementation detail; the Suite/collection name is what a QA
// engineer actually recognizes). Two sources can end up carrying it: no
// Suite/collection name was resolved at all, or execution-service's own
// newmanParser.js fallback ('Newman collection', used when a raw report's
// collection.info.name is missing) leaked through. Both collapse to the
// same neutral fallback here rather than trusting the caller never to pass
// either through.
export function sanitizeSuiteName(name, unnamedLabel) {
  if (!name || /newman/i.test(name)) return unnamedLabel;
  return name;
}

// Serializes a value for embedding inside an inline <script> tag. JSON.stringify
// alone isn't safe here: if any string value in the data (a response body,
// a header, a console log) happens to contain "</script>", it would close
// the tag early and either corrupt the report or let attacker-controlled
// text execute as script. Escaping every "<" defuses that regardless of
// where it appears in the payload, not just an exact "</script>" match.
function serializeForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Etapa 5 (docs/postman-runner/etapa-5-sistema-de-reportes.md), redesigned
// per docs/postman-runner/newman-report-sample.html: a sidebar-navigable,
// KPI-filterable report with collapsed request/response detail and syntax-
// highlighted JSON — built from the exact same buildPostmanRunReportData()
// output the PDF export uses (see that function's own comment), never a
// second, parallel read of the raw run/testResults. `meta` carries the
// handful of display-only fields that aren't part of that shared data shape
// because they come from other resources entirely (the PostmanSuite's own
// name, the Project's name, the environment file's name) — resolved by the
// caller (AutomationRunDetailPage), not fetched here, since this module
// stays pure/synchronous like buildPostmanRunReportData above it.
export function buildPostmanRunHtml({ data, labels, meta = {} }) {
  const { run, tests } = data;
  const suiteName = sanitizeSuiteName(
    meta.suiteName || tests[0]?.suiteName,
    labels.unnamedCollection,
  );
  const executedAtLabel = run.executedAt ? new Date(run.executedAt).toLocaleString() : '—';

  const reportData = {
    run: {
      suiteName,
      projectName: meta.projectName || '—',
      environmentName: meta.environmentName || labels.noEnvironment,
      executedAtLabel,
      durationMs: run.durationMs ?? null,
      triggerType: run.triggerType,
      total: run.totalTests,
      passed: run.passed,
      failed: run.failed,
      broken: run.broken,
      skipped: run.skipped,
    },
    tests: tests.map((testResult) => ({
      testName: testResult.suiteName
        ? `${testResult.suiteName} — ${testResult.testName}`
        : testResult.testName,
      method: testResult.method,
      url: testResult.url,
      status: testResult.status,
      responseStatus: testResult.responseStatus,
      requestHeaders: testResult.requestHeaders,
      requestBody: testResult.requestBody,
      responseHeaders: testResult.responseHeaders,
      responseBody: testResult.responseBody,
      logs: testResult.logs,
      errorMessage: testResult.errorMessage,
    })),
  };

  const strings = {
    brand: 'QUALIGUALI · POSTMAN RUNNER',
    reportTitlePrefix: labels.runReportTitle,
    executionTitle: (name) => (labels.reportExecutionTitle || '').replace('{{suiteName}}', name),
    generatedOnTrigger: (date, trigger) =>
      (labels.generatedOnTrigger || '').replace('{{date}}', date).replace('{{trigger}}', trigger),
    exportedAs: labels.exportedAsHtml,
    total: labels.totalTestCases,
    passed: labels.passed,
    failed: labels.failed,
    broken: labels.broken,
    skipped: labels.skipped,
    requestsExecutedNav: labels.requestsExecutedNav,
    environment: labels.environment,
    generalResult: labels.generalResult,
    passRateDuration: (rate, duration) =>
      (labels.passRateDuration || '').replace('{{rate}}', rate).replace('{{duration}}', duration),
    showingAllRequests: (count) => (labels.showingAllRequests || '').replace('{{count}}', count),
    showingFilteredRequests: (visible, total, status) =>
      (labels.showingFilteredRequests || '')
        .replace('{{visible}}', visible)
        .replace('{{total}}', total)
        .replace('{{status}}', status),
    viewAllRequests: labels.viewAllRequests,
    statusPill: {
      passed: labels.statusPillPassed,
      failed: labels.statusPillFailed,
      broken: labels.statusPillBroken,
      skipped: labels.statusPillSkipped,
    },
    requestHeaders: labels.requestHeaders,
    requestBody: labels.requestBody,
    responseHeaders: labels.responseHeaders,
    responseBody: labels.responseBody,
    logs: labels.logs,
    viewFullContent: labels.viewFullContent,
    footerBrand: labels.footerBrand,
    requestsCountDuration: (count, duration) =>
      (labels.requestsCountDuration || '')
        .replace('{{count}}', count)
        .replace('{{duration}}', duration),
    triggerType: {
      manual: labels.triggerType_manual,
      scheduled: labels.triggerType_scheduled,
      retry: labels.triggerType_retry,
    },
  };

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(strings.executionTitle(suiteName))}</title>
<style>
  :root {
    --brand: #ff6c37;
    --brand-dark: #e0551f;
    --bg: #f3f4f7;
    --surface: #ffffff;
    --text: #1a1d29;
    --muted: #6b7280;
    --border: #e5e7eb;
    --sidebar-bg: #171923;
    --sidebar-text: #cbd2e0;
    --sidebar-muted: #6b7280;
    --pass-bg: #e7f7ed;
    --pass-text: #15803d;
    --pass-strong: #16a34a;
    --fail-bg: #fdeaea;
    --fail-text: #b91c1c;
    --fail-strong: #dc2626;
    --broken-bg: #fdf1e0;
    --broken-text: #b45309;
    --skip-bg: #eef0f4;
    --skip-text: #4b5563;
    --code-bg: #1e2130;
    --code-text: #d4d8e4;
    --radius: 10px;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: var(--text);
    margin: 0;
    background: var(--bg);
    display: flex;
    min-height: 100vh;
  }
  aside {
    width: 280px;
    flex: none;
    background: var(--sidebar-bg);
    color: var(--sidebar-text);
    padding: 1.5rem 1.25rem;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .brand { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1.5rem; }
  .brand .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 3px rgba(255,108,55,0.25); }
  .brand span { font-weight: 700; letter-spacing: 0.02em; font-size: 0.95rem; color: #fff; }
  .suite-name { font-size: 1.05rem; font-weight: 600; color: #fff; margin: 0 0 0.15rem; }
  .suite-meta { font-size: 0.75rem; color: var(--sidebar-muted); margin: 0 0 1.5rem; line-height: 1.5; }
  .nav-label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--sidebar-muted); margin: 0 0 0.6rem; }
  .nav-list { list-style: none; margin: 0 0 1.5rem; padding: 0; display: flex; flex-direction: column; gap: 0.15rem; }
  .nav-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.55rem; border-radius: 7px; text-decoration: none; color: var(--sidebar-text); font-size: 0.82rem; transition: background 0.12s ease; }
  .nav-item:hover { background: rgba(255,255,255,0.06); }
  .nav-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
  .nav-dot.passed { background: var(--pass-strong); }
  .nav-dot.failed { background: var(--fail-strong); }
  .nav-dot.broken { background: #d97706; }
  .nav-dot.skipped { background: #9ca3af; }
  .nav-item .nav-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-method { font-size: 0.62rem; font-weight: 700; padding: 0.05rem 0.35rem; border-radius: 4px; flex: none; }
  .env-box { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 0.75rem 0.85rem; font-size: 0.75rem; color: var(--sidebar-muted); }
  .env-box b { color: #fff; font-weight: 600; }
  main { flex: 1; padding: 2rem 2.5rem 4rem; max-width: 980px; }
  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem; margin-bottom: 1.75rem; }
  .page-header h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .page-header .subtitle { color: var(--muted); font-size: 0.88rem; margin: 0; }
  .export-badge { background: var(--surface); border: 1px solid var(--border); border-radius: 999px; padding: 0.35rem 0.9rem; font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
  .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.85rem; margin-bottom: 1rem; }
  .kpi { background: var(--surface); border-radius: var(--radius); padding: 1rem 1.1rem; border: 1px solid var(--border); border-top: 3px solid var(--muted); font: inherit; text-align: left; cursor: pointer; width: 100%; transition: box-shadow 0.12s ease, transform 0.12s ease; }
  .kpi:hover { box-shadow: 0 2px 10px rgba(17,24,39,0.08); transform: translateY(-1px); }
  .kpi.active { box-shadow: 0 0 0 2px var(--brand) inset; }
  .kpi.total { border-top-color: var(--brand); }
  .kpi.passed { border-top-color: var(--pass-strong); }
  .kpi.failed { border-top-color: var(--fail-strong); }
  .kpi.broken { border-top-color: #d97706; }
  .kpi.skipped { border-top-color: #9ca3af; }
  .kpi strong { display: block; font-size: 1.65rem; line-height: 1.15; }
  .kpi span { font-size: 0.72rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .filter-status { font-size: 0.78rem; color: var(--muted); margin: 0 0 1rem; }
  .filter-status button { border: none; background: none; color: var(--brand-dark); font: inherit; font-weight: 600; cursor: pointer; padding: 0; text-decoration: underline; }
  .test.hidden-by-filter, .nav-item.hidden-by-filter { display: none; }
  .progress-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.9rem 1.1rem; margin-bottom: 2rem; }
  .progress-top { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--muted); margin-bottom: 0.5rem; }
  .progress-bar { display: flex; height: 8px; border-radius: 999px; overflow: hidden; background: var(--skip-bg); }
  .progress-seg.passed { background: var(--pass-strong); }
  .progress-seg.failed { background: var(--fail-strong); }
  .progress-seg.broken { background: #d97706; }
  .progress-seg.skipped { background: #9ca3af; }
  .test { background: var(--surface); border-radius: var(--radius); border: 1px solid var(--border); margin-bottom: 1.1rem; overflow: hidden; scroll-margin-top: 1.5rem; }
  .test-header { display: flex; align-items: center; gap: 0.75rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); }
  .method-badge { font-size: 0.68rem; font-weight: 700; padding: 0.22rem 0.5rem; border-radius: 5px; letter-spacing: 0.02em; flex: none; }
  .method-GET { background: #e7f3ff; color: #1d4ed8; }
  .method-POST { background: #e7f7ed; color: #15803d; }
  .method-PATCH { background: #f3e8ff; color: #7c3aed; }
  .method-PUT { background: #fef3c7; color: #b45309; }
  .method-DELETE { background: #fdeaea; color: #b91c1c; }
  .test-title { flex: 1; min-width: 0; }
  .test-title h3 { margin: 0; font-size: 0.95rem; font-weight: 600; }
  .request-line { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.78rem; color: var(--muted); margin: 0.15rem 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .status-pill { border-radius: 999px; padding: 0.28rem 0.75rem; font-size: 0.72rem; font-weight: 700; white-space: nowrap; flex: none; }
  .status-pill.passed { background: var(--pass-bg); color: var(--pass-text); }
  .status-pill.failed { background: var(--fail-bg); color: var(--fail-text); }
  .status-pill.broken { background: var(--broken-bg); color: var(--broken-text); }
  .status-pill.skipped { background: var(--skip-bg); color: var(--skip-text); }
  .http-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.75rem; font-weight: 600; color: var(--muted); background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 0.18rem 0.5rem; flex: none; }
  .test-body { padding: 0.25rem 1.25rem 1.1rem; }
  details.data-block { border-top: 1px dashed var(--border); padding: 0.6rem 0; }
  details.data-block:first-of-type { border-top: none; }
  details.data-block > summary { cursor: pointer; list-style: none; display: flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); font-weight: 600; user-select: none; }
  details.data-block > summary::-webkit-details-marker { display: none; }
  details.data-block > summary::before { content: "▸"; font-size: 0.7rem; color: var(--brand); transition: transform 0.12s ease; }
  details.data-block[open] > summary::before { transform: rotate(90deg); }
  details.data-block pre { margin: 0.55rem 0 0.15rem; background: var(--code-bg); color: var(--code-text); border-radius: 8px; padding: 0.85rem 1rem; overflow-x: auto; font-size: 0.78rem; line-height: 1.5; font-family: ui-monospace, Menlo, Consolas, monospace; }
  details.data-block .truncated-link { display: inline-block; margin: 0.55rem 0 0.15rem; }
  details.data-block .truncated-link a { color: var(--brand-dark); }
  .json-key { color: #7dd3fc; }
  .json-string { color: #86efac; }
  .json-number { color: #fca5a5; }
  .json-boolean { color: #fcd34d; }
  .json-null { color: #9ca3af; }
  .error-box { background: var(--fail-bg); color: var(--fail-text); border-radius: 8px; padding: 0.6rem 0.85rem; font-size: 0.82rem; margin: 0.5rem 0 0.75rem; }
  footer { margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--muted); display: flex; justify-content: space-between; }
  @media (max-width: 860px) {
    body { flex-direction: column; }
    aside { position: static; width: 100%; height: auto; }
    .kpis { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>
  <aside>
    <div class="brand"><span class="dot"></span><span>${escapeHtml(strings.brand)}</span></div>
    <p class="suite-name" id="sidebar-suite-name">—</p>
    <p class="suite-meta" id="sidebar-meta">—</p>
    <p class="nav-label" id="nav-label">—</p>
    <ul class="nav-list" id="nav-list"></ul>
    <p class="nav-label" id="env-label">—</p>
    <div class="env-box" id="env-box">—</div>
  </aside>
  <main>
    <div class="page-header">
      <div>
        <h1 id="main-title">—</h1>
        <p class="subtitle" id="main-subtitle">—</p>
      </div>
      <span class="export-badge" id="export-badge">—</span>
    </div>
    <div class="kpis" id="kpis"></div>
    <div class="progress-wrap">
      <div class="progress-top">
        <span id="progress-caption">—</span>
        <span id="progress-label">—</span>
      </div>
      <div class="progress-bar" id="progress-bar"></div>
    </div>
    <p class="filter-status" id="filter-status">—</p>
    <div id="tests-container"></div>
    <footer>
      <span id="footer-left">—</span>
      <span id="footer-right">—</span>
    </footer>
  </main>
<script>
  const REPORT_DATA = ${serializeForScript(reportData)};
  const STRINGS = ${serializeForScript({
    brand: strings.brand,
    total: strings.total,
    passed: strings.passed,
    failed: strings.failed,
    broken: strings.broken,
    skipped: strings.skipped,
    requestsExecutedNav: strings.requestsExecutedNav,
    environment: strings.environment,
    generalResult: strings.generalResult,
    viewAllRequests: strings.viewAllRequests,
    statusPill: strings.statusPill,
    requestHeaders: strings.requestHeaders,
    requestBody: strings.requestBody,
    responseHeaders: strings.responseHeaders,
    responseBody: strings.responseBody,
    logs: strings.logs,
    viewFullContent: strings.viewFullContent,
    footerBrand: strings.footerBrand,
    exportedAs: strings.exportedAs,
    triggerType: strings.triggerType,
  })};

  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Operates on text that is ALREADY JSON (buildPostmanRunReportData /
  // formatStoredField upstream already ran JSON.stringify(value, null, 2)
  // before this ever gets embedded) — no second stringify pass here, just
  // escape + colorize.
  function syntaxHighlight(jsonText) {
    if (jsonText === null || jsonText === undefined) return '<span class="json-null">null</span>';
    const escaped = escapeHtml(jsonText);
    return escaped.replace(
      /("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false)\\b|\\bnull\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)/g,
      (match) => {
        let cls = "json-number";
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? "json-key" : "json-string";
        } else if (/true|false/.test(match)) {
          cls = "json-boolean";
        } else if (/null/.test(match)) {
          cls = "json-null";
        }
        return \`<span class="\${cls}">\${match}</span>\`;
      },
    );
  }

  function fmtDuration(ms) {
    if (ms === null || ms === undefined) return "—";
    return ms < 1000 ? \`\${ms} ms\` : \`\${(ms / 1000).toFixed(2)} s\`;
  }

  function methodClass(method) {
    return \`method-\${(method || "GET").toUpperCase()}\`;
  }

  let activeFilter = "all";

  function buildKpis(run) {
    const items = [
      { label: STRINGS.total, value: run.total, cls: "total", filter: "all" },
      { label: STRINGS.passed, value: run.passed, cls: "passed", filter: "passed" },
      { label: STRINGS.failed, value: run.failed, cls: "failed", filter: "failed" },
      { label: STRINGS.broken, value: run.broken, cls: "broken", filter: "broken" },
      { label: STRINGS.skipped, value: run.skipped, cls: "skipped", filter: "skipped" },
    ];
    document.getElementById("kpis").innerHTML = items
      .map(
        (it) => \`<button type="button" class="kpi \${it.cls}\${it.filter === activeFilter ? " active" : ""}"
          data-filter="\${it.filter}" onclick="applyFilter('\${it.filter}')">
          <strong>\${it.value}</strong><span>\${escapeHtml(it.label)}</span>
        </button>\`,
      )
      .join("");
  }

  // Filters both the request cards and the sidebar nav by status — clicking
  // the active filter's own "view all" link (or the Total KPI again) resets
  // it. No framework: plain class toggles.
  function applyFilter(status) {
    activeFilter = status;

    document.querySelectorAll(".kpi[data-filter]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.filter === status);
    });

    const sections = Array.from(document.querySelectorAll("#tests-container .test"));
    let visible = 0;
    sections.forEach((section) => {
      const match = status === "all" || section.dataset.status === status;
      section.classList.toggle("hidden-by-filter", !match);
      if (match) visible += 1;
    });

    document.querySelectorAll("#nav-list .nav-item").forEach((item) => {
      const match = status === "all" || item.dataset.status === status;
      item.classList.toggle("hidden-by-filter", !match);
    });

    const label = document.getElementById("filter-status");
    if (status === "all") {
      label.textContent = ${JSON.stringify(labels.showingAllRequests || '')}.replace("{{count}}", sections.length);
    } else {
      const statusLabel = STRINGS.statusPill[status] || status;
      const template = ${JSON.stringify(labels.showingFilteredRequests || '')};
      label.innerHTML =
        escapeHtml(
          template
            .replace("{{visible}}", visible)
            .replace("{{total}}", sections.length)
            .replace("{{status}}", statusLabel),
        ) + \` <button type="button" onclick="applyFilter('all')">\${escapeHtml(STRINGS.viewAllRequests)}</button>\`;
    }
  }

  function buildProgress(run) {
    const total = run.total || 1;
    const pct = (n) => \`\${((n / total) * 100).toFixed(2)}%\`;
    document.getElementById("progress-bar").innerHTML = \`
      <div class="progress-seg passed" style="width:\${pct(run.passed)}"></div>
      <div class="progress-seg failed" style="width:\${pct(run.failed)}"></div>
      <div class="progress-seg broken" style="width:\${pct(run.broken)}"></div>
      <div class="progress-seg skipped" style="width:\${pct(run.skipped)}"></div>
    \`;
    const passRate = run.total ? Math.round((run.passed / run.total) * 100) : 0;
    const template = ${JSON.stringify(labels.passRateDuration || '')};
    document.getElementById("progress-label").textContent = template
      .replace("{{rate}}", passRate)
      .replace("{{duration}}", fmtDuration(run.durationMs));
  }

  // field: null | { truncated: true, url } | { truncated: false, text }
  // (see formatStoredField in postmanRunReport.js) — text is already
  // sanitized/JSON-stringified upstream, never re-derived here.
  function dataBlock(label, field) {
    if (!field) return "";
    const body = field.truncated
      ? \`<p class="truncated-link"><a href="\${escapeHtml(field.url)}" target="_blank" rel="noreferrer">\${escapeHtml(STRINGS.viewFullContent)}</a></p>\`
      : \`<pre>\${syntaxHighlight(field.text)}</pre>\`;
    return \`<details class="data-block"><summary>\${escapeHtml(label)}</summary>\${body}</details>\`;
  }

  function buildTestCard(test, index) {
    const anchor = \`test-\${index}\`;
    const errorBlock = test.errorMessage
      ? \`<div class="error-box">\${escapeHtml(test.errorMessage)}</div>\`
      : "";
    const logsBlock =
      test.logs && test.logs.length > 0
        ? \`<details class="data-block"><summary>\${escapeHtml(STRINGS.logs)}</summary><pre>\${escapeHtml(test.logs.join("\\n"))}</pre></details>\`
        : "";

    return \`
      <section class="test" id="\${anchor}" data-status="\${test.status}">
        <div class="test-header">
          <span class="method-badge \${methodClass(test.method)}">\${escapeHtml(test.method || "—")}</span>
          <div class="test-title">
            <h3>\${escapeHtml(test.testName)}</h3>
            <p class="request-line">\${escapeHtml(test.url || "—")}</p>
          </div>
          <span class="http-code">\${test.responseStatus ?? "—"}</span>
          <span class="status-pill \${test.status}">\${escapeHtml(STRINGS.statusPill[test.status] || test.status)}</span>
        </div>
        <div class="test-body">
          \${errorBlock}
          \${dataBlock(STRINGS.requestHeaders, test.requestHeaders)}
          \${dataBlock(STRINGS.requestBody, test.requestBody)}
          \${dataBlock(STRINGS.responseHeaders, test.responseHeaders)}
          \${dataBlock(STRINGS.responseBody, test.responseBody)}
          \${logsBlock}
        </div>
      </section>
    \`;
  }

  function buildNav(tests) {
    document.getElementById("nav-list").innerHTML = tests
      .map(
        (test, index) => \`
        <li>
          <a class="nav-item" href="#test-\${index}" data-status="\${test.status}">
            <span class="nav-dot \${test.status}"></span>
            <span class="nav-method method-badge \${methodClass(test.method)}">\${escapeHtml(test.method || "—")}</span>
            <span class="nav-name">\${escapeHtml(test.testName)}</span>
          </a>
        </li>\`,
      )
      .join("");
  }

  function render(data) {
    const { run, tests } = data;

    document.title = \`\${STRINGS.footerBrand} — \${run.suiteName}\`;
    document.getElementById("sidebar-suite-name").textContent = run.suiteName;
    document.getElementById("sidebar-meta").textContent = \`\${run.projectName} · \${run.executedAtLabel}\`;
    document.getElementById("nav-label").textContent = STRINGS.requestsExecutedNav;
    document.getElementById("env-label").textContent = STRINGS.environment;
    document.getElementById("env-box").innerHTML = \`<b>\${escapeHtml(run.environmentName)}</b>\`;

    document.getElementById("main-title").textContent = ${JSON.stringify(labels.reportExecutionTitle || '')}.replace("{{suiteName}}", run.suiteName);
    document.getElementById("main-subtitle").textContent = ${JSON.stringify(labels.generatedOnTrigger || '')}
      .replace("{{date}}", run.executedAtLabel)
      .replace("{{trigger}}", STRINGS.triggerType[run.triggerType] || run.triggerType);
    document.getElementById("export-badge").textContent = STRINGS.exportedAs;
    document.getElementById("progress-caption").textContent = STRINGS.generalResult;

    buildKpis(run);
    buildProgress(run);
    buildNav(tests);

    document.getElementById("tests-container").innerHTML = tests
      .map((t, i) => buildTestCard(t, i))
      .join("");

    applyFilter("all");

    document.getElementById("footer-left").textContent = STRINGS.footerBrand;
    document.getElementById("footer-right").textContent = ${JSON.stringify(labels.requestsCountDuration || '')}
      .replace("{{count}}", tests.length)
      .replace("{{duration}}", fmtDuration(run.durationMs));
  }

  render(REPORT_DATA);
</script>
</body>
</html>`;
}
