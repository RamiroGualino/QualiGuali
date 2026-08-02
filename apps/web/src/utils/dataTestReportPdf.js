import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { safeText } from './reportPdf';

// Etapa 8 (docs/data-testing/etapa-8-pdf-reporte.md): PDF de una Corrida de
// Validación — hermano de reportPdf.js, mismo margen/paleta base, pero un
// archivo propio en vez de una función más ahí adentro (ese ya tiene 2
// documentos grandes; este es un tercer dominio, no una variación de los
// otros dos). Reusa `safeText` (la única función de sanitización que
// reportPdf.js exporta — `stripLatexArtifacts` es interna a ese módulo, no
// hay forma de importarla aparte) para cualquier string con datos externos
// (nombres de columna, valores de `unexpectedSample`) antes de dibujarlo.
const COLOR = {
  textPrimary: [31, 41, 55],
  textSecondary: [107, 114, 128],
  border: [226, 229, 235],
  bg: [249, 250, 251],
  pass: [21, 128, 61],
  fail: [185, 28, 28],
  passBg: [220, 245, 227],
  failBg: [253, 226, 226],
  white: [255, 255, 255],
};

const MARGIN = 40;

function scopeKey(result) {
  if (result.column) return result.column;
  if (result.columns) return result.columns.join(' + ');
  return null; // nivel Tabla — agrupado aparte, ver groupResultsByColumn.
}

// Agrupa `results` por columna (REQ-DT-011/etapa-8: "agrupado por columna"),
// respetando el orden de `columnCoverage` (el mismo orden que expectedColumns
// tenía en la Suite) — las de nivel Tabla, sin columna propia, van en su
// propio grupo al principio (son las primeras en evaluarse, ver runEngine.js).
export function groupResultsByColumn(run, tableLevelLabel) {
  const byKey = new Map();
  run.results.forEach((result) => {
    const key = scopeKey(result) ?? tableLevelLabel;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(result);
  });

  const orderedKeys = [
    ...(byKey.has(tableLevelLabel) ? [tableLevelLabel] : []),
    ...run.columnCoverage.map((c) => c.expectedColumn).filter((column) => byKey.has(column)),
    // Cualquier grupo restante (multicolumna — su key es "A + B", no
    // aparece en columnCoverage) al final, en el orden en que runEngine.js
    // los evaluó.
    ...Array.from(byKey.keys()).filter(
      (key) => key !== tableLevelLabel && !run.columnCoverage.some((c) => c.expectedColumn === key),
    ),
  ];

  return orderedKeys.map((key) => ({ key, results: byKey.get(key) }));
}

// `run`: un ValidationRun (Etapa 1) tal como lo devuelve GET /validation-runs/:id.
// `suiteName`: resuelta aparte por el caller (ValidationRun no guarda el
// nombre de su Suite, solo `suiteId`) — mismo patrón que
// AutomationRunDetailPage resolviendo el nombre de Suite/proyecto.
// `labels`: strings ya traducidos vía i18next — este módulo se mantiene
// puro/agnóstico de idioma, mismo criterio que reportPdf.js.
export function buildValidationRunPdf({ run, suiteName, labels }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

  function text(value) {
    return safeText(value);
  }

  function ensureSpace(needed) {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  function heading(value, size = 14) {
    ensureSpace(size + 18);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(...COLOR.textPrimary);
    doc.text(text(value), MARGIN, y);
    y += 8;
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
  }

  function subheading(value) {
    ensureSpace(28);
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR.textPrimary);
    doc.text(text(value), MARGIN, y);
    y += 6;
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    doc.setFont('helvetica', 'normal');
    y += 12;
  }

  function paragraph(value, size = 9, color = COLOR.textPrimary) {
    if (!value) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text(value), contentWidth);
    const lineHeight = size * 1.35;
    ensureSpace(lines.length * lineHeight);
    doc.text(lines, MARGIN, y);
    y += lines.length * lineHeight + 4;
  }

  function tableDefaults(head, body) {
    return {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [head],
      body,
      theme: 'striped',
      styles: { fontSize: 9, textColor: COLOR.textPrimary, lineColor: COLOR.border },
      headStyles: { fillColor: COLOR.bg, textColor: COLOR.textSecondary, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: COLOR.bg },
    };
  }

  // ---- Encabezado ----
  const isPassed = run.overallStatus === 'passed';
  doc.setFillColor(...(isPassed ? COLOR.pass : COLOR.fail));
  doc.rect(0, 0, pageWidth, 56, 'F');
  doc.setTextColor(...COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(text(labels.reportTitle), MARGIN, 28);
  doc.setFontSize(12);
  doc.text(
    isPassed ? labels.overallPassedLabel : labels.overallFailedLabel,
    MARGIN,
    46,
  );
  y = 80;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLOR.textPrimary);
  doc.text(text(suiteName), MARGIN, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR.textSecondary);
  doc.text(`${labels.datasetLabel}: ${text(run.datasetName)}`, MARGIN, y);
  y += 14;
  const executedAtText = run.executedAt ? new Date(run.executedAt).toLocaleString() : '—';
  doc.text(`${labels.executedAtLabel}: ${executedAtText}`, MARGIN, y);
  y += 24;

  // ---- Bloque Cobertura de Columnas ----
  heading(labels.columnCoverageTitle);
  autoTable(
    doc,
    tableDefaults(
      [labels.expectedColumnHeader, labels.foundHeader],
      run.columnCoverage.map((coverage) => [
        text(coverage.expectedColumn),
        coverage.found ? labels.foundYes : labels.foundNo,
      ]),
    ),
  );
  y = doc.lastAutoTable.finalY + 20;

  // ---- Bloque Resultado por Expectativa (agrupado por columna) ----
  heading(labels.resultsTitle);
  if (run.results.length === 0) {
    paragraph(labels.noResults);
  }
  const groups = groupResultsByColumn(run, labels.tableLevelGroup);
  groups.forEach(({ key, results }) => {
    subheading(key);
    results.forEach((result) => {
      const passed = result.status === 'passed';
      ensureSpace(24);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...COLOR.textPrimary);
      const label = text(labels.expectations[result.expId] || result.expId);
      doc.text(label, MARGIN, y);

      const statusLabel = passed ? labels.statusPassed : labels.statusFailed;
      const statusColor = passed ? COLOR.pass : COLOR.fail;
      const statusBg = passed ? COLOR.passBg : COLOR.failBg;
      doc.setFontSize(8);
      const badgeWidth = doc.getTextWidth(statusLabel) + 16;
      const badgeX = pageWidth - MARGIN - badgeWidth;
      doc.setFillColor(...statusBg);
      doc.roundedRect(badgeX, y - 10, badgeWidth, 14, 7, 7, 'F');
      doc.setTextColor(...statusColor);
      doc.text(statusLabel, badgeX + badgeWidth / 2, y, { align: 'center' });
      y += 14;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...COLOR.textSecondary);
      const outcome =
        result.successPercent !== null && result.successPercent !== undefined
          ? `${labels.successPercentLabel}: ${result.successPercent}% / ${labels.thresholdLabel}: ${result.threshold ?? '—'}%`
          : result.actual !== undefined
            ? `${labels.actualLabel}: ${result.actual} (${labels.expectedLabel}: ${result.expected})`
            : null;
      if (outcome) {
        ensureSpace(12);
        doc.text(outcome, MARGIN, y);
        y += 12;
      }

      if (!passed && (result.unexpectedSample || []).length > 0) {
        const sample = result.unexpectedSample.map((value) => text(String(value))).join(', ');
        paragraph(`${labels.failureSampleLabel}: ${sample}`, 8.5, COLOR.fail);
      }

      if ((result.affectedRecords || []).length > 0) {
        const records = result.affectedRecords
          .map((record) => text(record.businessId || `#${record.rowId}`))
          .join(', ');
        paragraph(`${labels.affectedRecordsLabel}: ${records}`, 8.5, COLOR.textSecondary);
      }

      y += 6;
    });
  });

  return doc;
}
