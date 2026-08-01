import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { stripLegacyStepNumber } from './testCaseSteps';

// A neutral, "professional test-management tool" palette (TestRail/Zephyr-
// style) — cool grays instead of the old warm-tinted ones, a single
// corporate blue reserved for the case ID and other key accents, green
// reserved for successful/pass states only. Still just RGB tuples fed to
// jsPDF's setFillColor/setTextColor — no visual framework involved.
const COLOR = {
  primary: [63, 166, 108],
  accent: [37, 99, 235],
  pass: [21, 128, 61],
  fail: [185, 28, 28],
  warning: [180, 83, 9],
  textSecondary: [107, 114, 128],
  textPrimary: [31, 41, 55],
  border: [226, 229, 235],
  bg: [249, 250, 251],
  chipBg: [243, 244, 246],
  white: [255, 255, 255],
};

// Pastel tints of the same statuses, for badge/card backgrounds — plain
// colored text alone doesn't read as a "label" the way the on-screen
// StatusBadge pill does.
const STATUS_BG = {
  pass: [220, 245, 227],
  fail: [253, 226, 226],
  blocked: [253, 240, 214],
  not_executed: [237, 238, 240],
};

const STATUS_COLOR = {
  pass: COLOR.pass,
  fail: COLOR.fail,
  blocked: COLOR.warning,
  not_executed: COLOR.textSecondary,
};

// A distinct palette for the Postman Suite run PDF export (buildPostmanRunPdf
// below), matching the brand/status colors defined in
// docs/postman-runner/newman-report-sample.html (the HTML export's design
// reference) — kept separate from COLOR/STATUS_BG above (generateCycleReportPdf's
// own TestRail-style palette) so this doesn't change the look of the manual
// test-case report.
const POSTMAN_BRAND = [255, 108, 55]; // --brand
const POSTMAN_MUTED = [107, 114, 128]; // --muted
const POSTMAN_STATUS_TEXT = {
  passed: [21, 128, 61], // --pass-text
  failed: [185, 28, 28], // --fail-text
  broken: [180, 83, 9], // --broken-text
  skipped: [75, 85, 99], // --skip-text
};
const POSTMAN_STATUS_BG = {
  passed: [231, 247, 237], // --pass-bg
  failed: [253, 234, 234], // --fail-bg
  broken: [253, 241, 224], // --broken-bg
  skipped: [238, 240, 244], // --skip-bg
};
const POSTMAN_STATUS_STRONG = {
  passed: [22, 163, 74], // --pass-strong
  failed: [220, 38, 38], // --fail-strong
  broken: [217, 119, 6], // same as --broken-text used as a strong tone
  skipped: [156, 163, 175],
};
const POSTMAN_CODE_BG = [30, 33, 48]; // --code-bg
const POSTMAN_CODE_TEXT = [212, 216, 228]; // --code-text
const POSTMAN_METHOD_COLORS = {
  GET: { text: [29, 78, 216], bg: [231, 243, 255] },
  POST: { text: [21, 128, 61], bg: [231, 247, 237] },
  PATCH: { text: [124, 58, 237], bg: [243, 232, 255] },
  PUT: { text: [180, 83, 9], bg: [254, 243, 199] },
  DELETE: { text: [185, 28, 28], bg: [253, 234, 234] },
};

const MARGIN = 40;
// Every evidence photo renders inside a frame this size (image scaled to
// *fit inside*, aspect ratio kept, centered) — a uniform photo-grid card
// instead of each tile being a different size depending on what was
// screenshotted.
const EVIDENCE_FRAME_WIDTH = 235;
const EVIDENCE_FRAME_HEIGHT = 180;
const EVIDENCE_FRAME_PADDING = 8;
const EVIDENCE_FRAME_GAP = 12;
const PDF_TEXT_MAX_LENGTH = 800;
const PDF_TITLE_MAX_LENGTH = 120;
const PDF_TRUNCATION_SUFFIX = '… (truncated — see full text in the app)';

// jsPDF's own word-wrap (splitTextToSize, used by paragraph() below) only
// breaks at existing whitespace — a single very long "word" (like minified
// JSON pasted into a field with no spaces) renders as one oversized line
// that runs off the page instead of wrapping. Insert a zero-width space
// every 40 characters inside any run that has none, so jsPDF always has
// somewhere to break.
function breakLongTokens(text, chunkSize = 40) {
  const zeroWidthSpace = '​';
  return text.replace(/\S{60,}/g, (token) =>
    token.replace(new RegExp(`(.{${chunkSize}})`, 'g'), `$1${zeroWidthSpace}`),
  );
}

// Some imported fields (Kualitee-style Excel data, notes written outside
// the app) carry LaTeX-style math delimiters — "$(Sit=0)$" — or Unicode
// symbols (arrows, "≠") jsPDF's standard, non-embedded font can't render
// reliably — an unsupported glyph doesn't just print as a box, it corrupts
// that string's whole width measurement, spacing every other character out
// and throwing off wrapping/overlap with neighboring elements. Unwrap/
// replace them so the PDF always prints plain text, never a stray "$" or a
// mis-rendered glyph.
function stripLatexArtifacts(text) {
  return (
    text
      .replace(/\$\(([^)]*)\)\$/g, '($1)')
      .replace(/\$([^$]*)\$/g, '$1')
      .replace(/\$/g, '')
      .replace(/→/g, '->')
      .replace(/≠/g, '!=')
      // Expected-result bullets imported from Excel often lead with ✓/✗ —
      // neither is in jsPDF's font either. The plain "•" used elsewhere in
      // this same document (preconditions) already renders fine, and the
      // sentence itself states whether it's a pass or fail case either way.
      .replace(/[✓✔✗✘]/g, '•')
  );
}

// Prevents a pasted JSON blob (or any unexpectedly huge field — e.g. from
// the Excel Transformer) from turning one test case's section into dozens
// of unreadable pages. Caps the length and points back at the app for the
// full value, same reasoning as ExpandableText on-screen.
export function safeText(
  text,
  maxLength = PDF_TEXT_MAX_LENGTH,
  truncationSuffix = PDF_TRUNCATION_SUFFIX,
) {
  if (!text) return text;
  const plain = stripLatexArtifacts(text);
  const capped =
    plain.length > maxLength ? `${plain.slice(0, maxLength)}${truncationSuffix}` : plain;
  return breakLongTokens(capped);
}

const IMAGE_FORMAT_BY_MIME = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/jpg': 'JPEG',
  'image/webp': 'WEBP',
};

// Fetches an evidence image and resolves it to the { dataUrl, format,
// width, height } shape generateCycleReportPdf embeds directly — kept
// separate from layout so a failed fetch (network hiccup, deleted file)
// can be swallowed per-image without aborting the whole export.
export async function loadImageForPdf(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch evidence image: ${response.status}`);
  const blob = await response.blob();
  const format = IMAGE_FORMAT_BY_MIME[blob.type];
  if (!format) throw new Error(`Unsupported evidence image type: ${blob.type}`);
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const { width, height } = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to decode evidence image'));
    img.src = dataUrl;
  });
  return { dataUrl, format, width, height };
}

// Builds a native, text-based PDF (tables + drawn shapes, not a screenshot
// of the DOM) so it reads like a real report: a KPI dashboard, a status
// bar, a case-by-case detail section (steps, comments, evidence, related
// defects), and automation failures. `labels` carries every translated
// string the page already has via i18next — this module stays pure/
// locale-agnostic.
export function generateCycleReportPdf({ cycleName, generatedAt, kpis, cases, failures, labels }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const truncationSuffix = labels.truncatedNote || PDF_TRUNCATION_SUFFIX;
  let y = MARGIN;

  // Local wrapper so every call site below gets the locale-aware
  // truncation suffix without threading it through each call.
  function text(value, maxLength) {
    return safeText(value, maxLength, truncationSuffix);
  }

  function ensureSpace(needed) {
    if (y + needed > pageHeight - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  }

  // Top-level report sections ("Case summary", "Case details", ...) — a
  // thin rule underneath separates each from whatever it introduces, same
  // idea as subheading() below but a size tier up.
  function heading(value, size = 14) {
    ensureSpace(size + 18);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    doc.setTextColor(...COLOR.textPrimary);
    doc.text(value, MARGIN, y);
    y += 8;
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.75);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
  }

  function paragraph(value, size = 9.5, color = COLOR.textPrimary) {
    if (!value) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(value, contentWidth);
    const lineHeight = size * 1.35;
    ensureSpace(lines.length * lineHeight);
    doc.text(lines, MARGIN, y);
    y += lines.length * lineHeight + 6;
  }

  // Precondiciones/Pasos/Resultado esperado/Historial de ejecuciones — a
  // full size tier up from body text, generous top margin so each section
  // reads as a clean break from the last, thin gray rule underneath.
  function subheading(value) {
    ensureSpace(28);
    y += 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR.textPrimary);
    doc.text(value, MARGIN, y);
    y += 6;
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    doc.setFont('helvetica', 'normal');
    y += 12;
  }

  // Several short label:value pairs (Priority, Testing type, Execution
  // type) side by side on one line instead of each getting its own —
  // stacking three two-word values vertically was most of this section's
  // wasted whitespace. Skips entirely if nothing in the row has a value.
  function fieldRow(pairs) {
    const visible = pairs.filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    );
    if (visible.length === 0) return;
    ensureSpace(13);
    doc.setFontSize(9);
    let x = MARGIN;
    visible.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLOR.textSecondary);
      doc.text(`${label}:`, x, y);
      x += doc.getTextWidth(`${label}: `);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLOR.textPrimary);
      const valueText = String(value);
      doc.text(valueText, x, y);
      x += doc.getTextWidth(valueText) + 24;
    });
    y += 13;
  }

  // Same label:value pairs as fieldRow, but as small rounded chips (light
  // gray fill) — for the handful of fields (Priority, Testing type,
  // Execution type) that read more like status tags than a form field.
  function chipRow(pairs) {
    const visible = pairs.filter(
      ([, value]) => value !== null && value !== undefined && value !== '',
    );
    if (visible.length === 0) return;
    const chipHeight = 18;
    ensureSpace(chipHeight + 4);
    doc.setFontSize(8.5);
    let x = MARGIN;
    visible.forEach(([label, value]) => {
      const label_ = `${label}: `;
      const valueText = String(value);
      // Measure each run in the font it's actually drawn with — label_ is
      // bold, valueText is normal, and bold glyphs are wider than normal
      // ones at the same size. Measuring both with whatever font happened
      // to be active undersizes the gap and draws the value overlapping
      // the tail of the label instead of right after it.
      doc.setFont('helvetica', 'bold');
      const labelWidth = doc.getTextWidth(label_);
      doc.setFont('helvetica', 'normal');
      const valueWidth = doc.getTextWidth(valueText);
      const chipWidth = labelWidth + valueWidth + 16;
      doc.setFillColor(...COLOR.chipBg);
      doc.roundedRect(x, y - chipHeight + 4, chipWidth, chipHeight, 5, 5, 'F');
      const textY = y - chipHeight / 2 + 6.5;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...COLOR.textSecondary);
      doc.text(label_, x + 8, textY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLOR.textPrimary);
      doc.text(valueText, x + 8 + labelWidth, textY);
      x += chipWidth + 8;
    });
    y += chipHeight + 6;
  }

  // A numbered step: a small filled circle with the step number (plain
  // ASCII digit — a Unicode circled numeral like "①" isn't in jsPDF's
  // standard font and corrupts the whole string's width, same failure
  // mode as the ✓/✗/≠ glyphs stripLatexArtifacts already guards against),
  // then the step text hanging-indented to its right.
  function stepItem(number, value) {
    if (!value) return;
    const circleR = 8;
    const textX = MARGIN + circleR * 2 + 8;
    const wrapWidth = contentWidth - (circleR * 2 + 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(value, wrapWidth);
    const lineHeight = 9.5 * 1.35;
    const blockHeight = Math.max(lines.length * lineHeight, circleR * 2);
    ensureSpace(blockHeight + 10);
    const circleCenterY = y - 9.5 * 0.32 + 0.5;
    doc.setFillColor(...COLOR.accent);
    doc.circle(MARGIN + circleR, circleCenterY, circleR, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.white);
    doc.text(String(number), MARGIN + circleR, circleCenterY + 2.8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...COLOR.textPrimary);
    doc.text(lines, textX, y);
    y += Math.max(lines.length * lineHeight, circleR * 2 + 4) + 8;
  }

  // Preconditions/Expected result text arrives as one "• line\n• line"
  // blob (bullets already embedded per line by the app). Redraws each
  // line with a small drawn bullet dot (in `dotColor`) instead of the "•"
  // character, with a hanging indent so wrapped continuation lines still
  // align under the text, not under the dot.
  function bulletBlock(value, dotColor = COLOR.textSecondary, size = 9.5) {
    if (!value) return;
    const bulletX = MARGIN + 3;
    const textX = MARGIN + 12;
    const wrapWidth = contentWidth - 12;
    const lineHeight = size * 1.4;
    value.split('\n').forEach((rawLine) => {
      const isBullet = rawLine.trimStart().startsWith('• ');
      const lineText = isBullet ? rawLine.trimStart().slice(2) : rawLine;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(lineText, isBullet ? wrapWidth : contentWidth);
      ensureSpace(lines.length * lineHeight + 3);
      if (isBullet) {
        doc.setFillColor(...dotColor);
        doc.circle(bulletX, y - size * 0.32, 1.6, 'F');
      }
      doc.setTextColor(...COLOR.textPrimary);
      doc.text(lines, isBullet ? textX : MARGIN, y);
      y += lines.length * lineHeight + 3;
    });
    y += 3;
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

  // Draws a status value as a colored pill (background tint + bold colored
  // label) instead of plain colored text — used by the KPI dashboard, the
  // case summary table's Status column, each case's detail heading, and
  // each history entry. align: 'center' (default, x is the pill's center —
  // e.g. centered in a table cell), 'right' (x is the pill's right edge —
  // e.g. flush against the page margin), or 'left' (x is the pill's left
  // edge).
  function statusBadge(x, centerY, label, status, align = 'center') {
    const color = STATUS_COLOR[status] || COLOR.textSecondary;
    const bg = STATUS_BG[status] || COLOR.bg;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const textWidth = doc.getTextWidth(label);
    const badgeHeight = 15;
    const badgeWidth = textWidth + 16;
    const left = align === 'right' ? x - badgeWidth : align === 'left' ? x : x - badgeWidth / 2;
    doc.setFillColor(...bg);
    doc.roundedRect(left, centerY - badgeHeight / 2, badgeWidth, badgeHeight, 7.5, 7.5, 'F');
    doc.setTextColor(...color);
    doc.text(label, left + badgeWidth / 2, centerY + 3, { align: 'center' });
    return badgeWidth;
  }

  // A uniform "photo frame" for one evidence image: light-gray bordered,
  // rounded corners, a faint offset rect behind it standing in for a soft
  // drop shadow (jsPDF's core build has no real alpha/blur to draw one).
  // Every frame is the same EVIDENCE_FRAME_WIDTH x HEIGHT regardless of the
  // screenshot's own aspect ratio — the image is scaled to fit inside
  // (never cropped or stretched) and centered.
  function evidenceFrame(x, frameY, image) {
    const shadowOffset = 2.5;
    doc.setFillColor(...COLOR.border);
    doc.roundedRect(
      x + shadowOffset,
      frameY + shadowOffset,
      EVIDENCE_FRAME_WIDTH,
      EVIDENCE_FRAME_HEIGHT,
      6,
      6,
      'F',
    );
    doc.setFillColor(...COLOR.white);
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.75);
    doc.roundedRect(x, frameY, EVIDENCE_FRAME_WIDTH, EVIDENCE_FRAME_HEIGHT, 6, 6, 'FD');

    const innerWidth = EVIDENCE_FRAME_WIDTH - EVIDENCE_FRAME_PADDING * 2;
    const innerHeight = EVIDENCE_FRAME_HEIGHT - EVIDENCE_FRAME_PADDING * 2;
    const scale = Math.min(innerWidth / image.width, innerHeight / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const imageX = x + (EVIDENCE_FRAME_WIDTH - width) / 2;
    const imageY = frameY + (EVIDENCE_FRAME_HEIGHT - height) / 2;
    doc.addImage(image.dataUrl, image.format, imageX, imageY, width, height);
  }

  // ---- Header banner ----
  doc.setFillColor(...COLOR.primary);
  doc.rect(0, 0, pageWidth, 56, 'F');
  doc.setTextColor(...COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(labels.reportTitle, MARGIN, 34);
  y = 80;

  doc.setTextColor(...COLOR.textPrimary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(cycleName, MARGIN, y);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR.textSecondary);
  doc.text(`${labels.generatedAt}: ${generatedAt.toLocaleString()}`, MARGIN, y);
  y += 24;

  // ---- KPI dashboard ----
  heading(labels.statusBreakdown);
  const passRate = kpis.total > 0 ? Math.round((kpis.pass / kpis.total) * 100) : 0;
  const kpiCards = [
    { value: kpis.total, label: labels.totalTestCases, color: COLOR.textPrimary, bg: COLOR.bg },
    { value: kpis.pass, label: labels.passed, color: COLOR.pass, bg: STATUS_BG.pass },
    { value: kpis.fail, label: labels.failed, color: COLOR.fail, bg: STATUS_BG.fail },
    { value: kpis.blocked, label: labels.blocked, color: COLOR.warning, bg: STATUS_BG.blocked },
    { value: `${passRate}%`, label: labels.passRate, color: COLOR.primary, bg: STATUS_BG.pass },
  ];
  const cardGap = 8;
  const cardHeight = 58;
  const cardWidth = (contentWidth - cardGap * (kpiCards.length - 1)) / kpiCards.length;
  ensureSpace(cardHeight + 10);
  kpiCards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    doc.setFillColor(...card.bg);
    doc.roundedRect(x, y, cardWidth, cardHeight, 5, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(...card.color);
    doc.text(String(card.value), x + cardWidth / 2, y + 28, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.textSecondary);
    doc.text(card.label, x + cardWidth / 2, y + 44, { align: 'center' });
  });
  y += cardHeight + 20;

  // Status distribution bar, drawn as vector rects (crisp at any zoom,
  // unlike a screenshot).
  const total = kpis.total || 1;
  const barHeight = 14;
  let barX = MARGIN;
  ensureSpace(barHeight + 20);
  [
    { value: kpis.pass, color: COLOR.pass },
    { value: kpis.fail, color: COLOR.fail },
    { value: kpis.blocked, color: COLOR.warning },
    { value: kpis.notExecuted, color: COLOR.textSecondary },
  ].forEach((segment) => {
    const width = (segment.value / total) * contentWidth;
    if (width > 0) {
      doc.setFillColor(...segment.color);
      doc.rect(barX, y, width, barHeight, 'F');
      barX += width;
    }
  });
  y += barHeight + 20;

  // ---- Case summary table ----
  heading(labels.caseSummaryTitle);
  autoTable(
    doc,
    Object.assign(
      tableDefaults(
        [labels.testCaseId, labels.testCase, labels.priority, labels.testingType, labels.status],
        cases.map((testCase) => [
          testCase.testCaseId || '—',
          text(testCase.title, PDF_TITLE_MAX_LENGTH),
          testCase.priorityLabel,
          testCase.testingTypeLabel,
          testCase.statusLabel,
        ]),
      ),
      {
        columnStyles: {
          0: { cellWidth: contentWidth * 0.14, halign: 'center' },
          1: { cellWidth: contentWidth * 0.42 },
          2: { cellWidth: contentWidth * 0.13, halign: 'center' },
          3: { cellWidth: contentWidth * 0.14, halign: 'center' },
          4: { cellWidth: contentWidth * 0.17, halign: 'center' },
        },
        didParseCell(data) {
          // Column 4 (Status) is drawn as a badge in didDrawCell below —
          // suppress autoTable's own text so it isn't drawn twice.
          if (data.section === 'body' && data.column.index === 4) {
            data.cell.text = [];
          }
        },
        didDrawCell(data) {
          if (data.section !== 'body' || data.column.index !== 4) return;
          const testCase = cases[data.row.index];
          statusBadge(
            data.cell.x + data.cell.width / 2,
            data.cell.y + data.cell.height / 2,
            testCase.statusLabel,
            testCase.status,
          );
        },
      },
    ),
  );
  y = doc.lastAutoTable.finalY + 24;

  // ---- Case-by-case detail ----
  heading(labels.caseDetailsTitle);
  cases.forEach((testCase) => {
    // Every case — including the first — starts on its own fresh page.
    // Sharing a page with the KPI dashboard/summary table above (or with
    // the previous case) only leaves a little leftover room, so a case's
    // own sections end up splitting across a page boundary even when the
    // case itself is short; a full fresh page avoids that far more often.
    doc.addPage();
    y = MARGIN;

    // Case heading: the case's own Test Case ID in the corporate blue
    // accent, title in large bold dark text right after it (wrapping to a
    // second line — reserving room for the status pill — rather than
    // running under/behind it if the title is long), status as a pill on
    // the right instead of plain colored text.
    const CASE_TITLE_SIZE = 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(CASE_TITLE_SIZE);
    const idPrefix = testCase.testCaseId ? `${testCase.testCaseId}: ` : '';
    const idWidth = idPrefix ? doc.getTextWidth(idPrefix) : 0;
    const badgeReserve = 92;
    const titleLines = doc.splitTextToSize(
      text(testCase.title, PDF_TITLE_MAX_LENGTH),
      Math.max(contentWidth - idWidth - badgeReserve, 100),
    );
    const titleLineHeight = CASE_TITLE_SIZE * 1.2;
    ensureSpace(titleLines.length * titleLineHeight + 16);
    if (idPrefix) {
      doc.setTextColor(...COLOR.accent);
      doc.text(idPrefix, MARGIN, y);
    }
    doc.setTextColor(...COLOR.textPrimary);
    doc.text(titleLines[0] ?? '', MARGIN + idWidth, y);
    statusBadge(pageWidth - MARGIN, y - 4, testCase.statusLabel, testCase.status, 'right');
    if (titleLines.length > 1) {
      // statusBadge leaves the font/size/color it drew its label with
      // active — restore the title's own styling before drawing the rest
      // of it, or these lines pick up the badge's small bold status color.
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(CASE_TITLE_SIZE);
      doc.setTextColor(...COLOR.textPrimary);
      doc.text(titleLines.slice(1), MARGIN, y + titleLineHeight);
    }
    doc.setFont('helvetica', 'normal');
    y += titleLines.length * titleLineHeight + 12;

    chipRow([
      [labels.priority, testCase.priorityLabel],
      [labels.testingType, testCase.testingTypeLabel],
      [labels.executionType, testCase.executionTypeLabel],
    ]);
    fieldRow([
      [labels.assignee, testCase.assignee],
      [
        labels.estimatedTime,
        testCase.estimatedTime === null || testCase.estimatedTime === undefined
          ? null
          : testCase.estimatedTime,
      ],
    ]);
    y += 4;

    if (testCase.preconditions) {
      subheading(labels.preconditions);
      bulletBlock(text(testCase.preconditions), COLOR.textSecondary);
    }

    if (testCase.steps.length > 0) {
      subheading(labels.steps);
      testCase.steps.forEach((step, index) => {
        // ASCII arrow, not "→": jsPDF's standard fonts use the WinAnsi/
        // cp1252 charset, which doesn't include U+2192 — including it
        // corrupts that string's width measurement (breaks wrapping into
        // one-character "lines" for the whole paragraph, not just the
        // arrow itself).
        const action = text(stripLegacyStepNumber(step.action));
        const suffix = step.expectedResult ? ` -> ${text(step.expectedResult)}` : '';
        stepItem(index + 1, `${action}${suffix}`);
      });
    }

    if (testCase.expectedResult) {
      subheading(labels.expectedResult);
      bulletBlock(text(testCase.expectedResult), COLOR.pass);
    }

    if (testCase.postconditions) {
      subheading(labels.postconditions);
      paragraph(text(testCase.postconditions));
    }

    if (testCase.status === 'fail') {
      subheading(labels.relatedDefects);
      if (testCase.defects.length === 0) {
        paragraph(labels.noRelatedDefects, 9);
      } else {
        testCase.defects.forEach((defect) => {
          paragraph(`${defect.code} — ${text(defect.title)}`, 9);
        });
      }
    }

    // Only the most recent attempt — earlier ones are still in the app's
    // Every attempt, each with its own evidence (same executionHistoryId
    // linking the on-screen drawer uses) — a real listing of what
    // happened, not just a snapshot of the most recent result. Each
    // attempt renders as its own bordered card (status pill, timestamp,
    // tester, the "Resultado obtenido" write-up as its own labeled block,
    // then a uniform photo-grid of that attempt's evidence) instead of
    // everything running together in one undifferentiated block.
    if (testCase.history.length > 0) {
      subheading(labels.history);
      testCase.history.forEach((entry) => {
        const cardPad = 12;
        const innerX = MARGIN + cardPad;
        const innerWidth = contentWidth - cardPad * 2;
        // The border below is drawn retroactively from cardStartY to the
        // final y, which only makes sense if the whole card stayed on one
        // page — if ensureSpace() had to start a new page partway through
        // (a long comment + several photos), cardStartY and y now belong
        // to different pages and the rect would come out corrupted. Skip
        // the border rather than risk that; the content itself still lays
        // out fine across the page break either way.
        const startPageCount = doc.internal.getNumberOfPages();
        ensureSpace(cardPad * 2 + 26);
        const cardStartY = y;
        y += cardPad + 8;

        const badgeWidth = statusBadge(innerX, y - 4, entry.statusLabel, entry.status, 'left');
        const when = entry.executedAt ? new Date(entry.executedAt).toLocaleString() : '—';
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...COLOR.textSecondary);
        doc.text(when, innerX + badgeWidth + 10, y);
        y += 18;
        ensureSpace(16);
        doc.text(`${labels.testedBy}: ${entry.testedBy}`, innerX, y);
        y += 16;

        if (entry.comments) {
          ensureSpace(13);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9.5);
          doc.setTextColor(...COLOR.textPrimary);
          doc.text(labels.actualResult, innerX, y);
          y += 13;
          const commentLines = doc.splitTextToSize(text(entry.comments, 400), innerWidth);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(...COLOR.textPrimary);
          const commentLineHeight = 9 * 1.35;
          ensureSpace(commentLines.length * commentLineHeight);
          doc.text(commentLines, innerX, y);
          y += commentLines.length * commentLineHeight + 6;
        }

        const hasImages = entry.images.length > 0;
        if (hasImages || entry.otherEvidenceCount > 0) {
          ensureSpace(10);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(...COLOR.textSecondary);
          doc.text(labels.evidence, innerX, y);
          y += 10;
        }

        if (hasImages) {
          let rowX = innerX;
          ensureSpace(EVIDENCE_FRAME_HEIGHT + EVIDENCE_FRAME_GAP);
          entry.images.forEach((image) => {
            if (rowX + EVIDENCE_FRAME_WIDTH > MARGIN + cardPad + innerWidth) {
              rowX = innerX;
              y += EVIDENCE_FRAME_HEIGHT + EVIDENCE_FRAME_GAP;
              ensureSpace(EVIDENCE_FRAME_HEIGHT + EVIDENCE_FRAME_GAP);
            }
            evidenceFrame(rowX, y, image);
            rowX += EVIDENCE_FRAME_WIDTH + EVIDENCE_FRAME_GAP;
          });
          y += EVIDENCE_FRAME_HEIGHT + 6;
          if (entry.otherEvidenceCount > 0) paragraph(labels.nonImageEvidenceNote, 8.5);
        } else if (entry.otherEvidenceCount > 0) {
          paragraph(labels.nonImageEvidenceNote, 8.5);
        }

        y += cardPad;
        if (doc.internal.getNumberOfPages() === startPageCount) {
          doc.setDrawColor(...COLOR.border);
          doc.setLineWidth(0.75);
          doc.roundedRect(MARGIN, cardStartY, contentWidth, y - cardStartY, 6, 6, 'S');
        }
        y += EVIDENCE_FRAME_GAP;
      });
    } else {
      subheading(labels.evidence);
      paragraph(labels.noEvidence, 9);
    }

    y += 10;
  });

  // ---- Automation failures ----
  if (failures.length > 0) {
    heading(labels.failuresTitle);
    autoTable(
      doc,
      tableDefaults(
        [labels.origin, labels.testCase, labels.status, labels.linkedDefect],
        failures.map((failure) => [
          failure.origin,
          failure.testName,
          failure.status,
          failure.linkedDefect ? failure.linkedDefect.code : '—',
        ]),
      ),
    );
  }

  return doc;
}

// Etapa 5 (docs/postman-runner/etapa-5-sistema-de-reportes.md): the Postman
// Suite run counterpart to generateCycleReportPdf above — same page/margin
// setup, same status-badge/table styling, same one-sheet-per-case
// pagination idea (here: one sheet per test), just a leaner document (no
// steps/evidence/defects section, since a Postman test doesn't have any of
// those — it has a method/URL/status and a request/response instead).
// `data` is exactly buildPostmanRunReportData()'s output — already
// sanitized (safeText/stripLatexArtifacts), so unlike generateCycleReportPdf
// this function doesn't need its own text()/safeText wrapper at all.
export function buildPostmanRunPdf({ data, labels, meta = {} }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = MARGIN;

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
    doc.text(value, MARGIN, y);
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
    doc.text(value, MARGIN, y);
    y += 6;
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    doc.setFont('helvetica', 'normal');
    y += 12;
  }

  function paragraph(value, size = 9.5, color = COLOR.textPrimary) {
    if (!value) return;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(value, contentWidth);
    const lineHeight = size * 1.35;
    ensureSpace(lines.length * lineHeight);
    doc.text(lines, MARGIN, y);
    y += lines.length * lineHeight + 6;
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

  // Status pill: same 4-tone palette (--pass/--fail/--broken/--skip) the
  // HTML report's .status-pill uses, so a run's pass/fail/broken/skipped
  // color-coding reads identically in both exports.
  function statusBadge(x, centerY, label, status, align = 'center') {
    const color = POSTMAN_STATUS_TEXT[status] || POSTMAN_MUTED;
    const bg = POSTMAN_STATUS_BG[status] || COLOR.bg;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const textWidth = doc.getTextWidth(label);
    const badgeHeight = 15;
    const badgeWidth = textWidth + 16;
    const left = align === 'right' ? x - badgeWidth : align === 'left' ? x : x - badgeWidth / 2;
    doc.setFillColor(...bg);
    doc.roundedRect(left, centerY - badgeHeight / 2, badgeWidth, badgeHeight, 7.5, 7.5, 'F');
    doc.setTextColor(...color);
    doc.text(label, left + badgeWidth / 2, centerY + 3, { align: 'center' });
    return badgeWidth;
  }

  // HTTP-method chip — the PDF equivalent of the HTML report's
  // .method-badge/.method-GET.../.method-DELETE classes.
  function methodBadge(x, centerY, method) {
    if (!method) return 0;
    const palette = POSTMAN_METHOD_COLORS[method] || { text: POSTMAN_MUTED, bg: COLOR.chipBg };
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    const textWidth = doc.getTextWidth(method);
    const badgeHeight = 15;
    const badgeWidth = textWidth + 14;
    doc.setFillColor(...palette.bg);
    doc.roundedRect(x, centerY - badgeHeight / 2, badgeWidth, badgeHeight, 3.5, 3.5, 'F');
    doc.setTextColor(...palette.text);
    doc.text(method, x + badgeWidth / 2, centerY + 3, { align: 'center' });
    return badgeWidth;
  }

  // Renders `text` as a dark, monospace "code panel" — the PDF equivalent of
  // the HTML report's <pre> blocks (var(--code-bg)/var(--code-text)). Sized
  // up front (not line-by-line via paragraph()) so ensureSpace() moves the
  // *whole* panel to a fresh page rather than splitting its background
  // rectangle across a page break.
  function codePanel(rawText) {
    const size = 8.5;
    doc.setFont('courier', 'normal');
    doc.setFontSize(size);
    const innerWidth = contentWidth - 20;
    const lines = doc.splitTextToSize(rawText, innerWidth);
    const lineHeight = size * 1.45;
    const panelHeight = lines.length * lineHeight + 16;
    ensureSpace(panelHeight + 8);
    doc.setFillColor(...POSTMAN_CODE_BG);
    doc.roundedRect(MARGIN, y - 4, contentWidth, panelHeight, 5, 5, 'F');
    doc.setTextColor(...POSTMAN_CODE_TEXT);
    doc.text(lines, MARGIN + 10, y + 10);
    y += panelHeight + 10;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLOR.textPrimary);
  }

  function fieldBlock(label, field) {
    if (!field) return;
    subheading(label);
    if (field.truncated) {
      paragraph(`${labels.viewFullContent}: ${field.url}`, 9, COLOR.accent);
      return;
    }
    codePanel(field.text);
  }

  // 'passed'/'failed'/'broken'/'skipped' -> the same translated pill text
  // the HTML report's STRINGS.statusPill uses, instead of the raw status.
  function statusPillLabel(status) {
    const key = `statusPill${status.charAt(0).toUpperCase()}${status.slice(1)}`;
    return labels[key] || status;
  }

  const { run, tests } = data;
  const executedAtLabel = run.executedAt ? new Date(run.executedAt).toLocaleString() : '—';
  const triggerLabel = labels[`triggerType_${run.triggerType}`] || run.triggerType;

  // ---- Header banner (brand orange, matching --brand in the HTML report) ----
  doc.setFillColor(...POSTMAN_BRAND);
  doc.rect(0, 0, pageWidth, 56, 'F');
  doc.setTextColor(...COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(labels.reportTitle, MARGIN, 34);
  y = 80;

  doc.setTextColor(...COLOR.textPrimary);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(labels.runTitle, MARGIN, y);
  y += 20;

  // Subtitle: generated-on + trigger type, same wording/labels as the HTML
  // report's page-header subtitle.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR.textSecondary);
  const subtitle = (labels.generatedOnTrigger || '')
    .replace('{{date}}', executedAtLabel)
    .replace('{{trigger}}', triggerLabel);
  doc.text(subtitle || `${labels.executedAt}: ${executedAtLabel}`, MARGIN, y);
  y += 15;

  // Project / environment meta line — the PDF equivalent of the HTML
  // sidebar's project line and env-box.
  const metaLine = [meta.projectName, `${labels.environment}: ${meta.environmentName || labels.noEnvironment}`]
    .filter(Boolean)
    .join('   ·   ');
  if (metaLine) {
    doc.text(metaLine, MARGIN, y);
    y += 15;
  }
  y += 9;

  // ---- KPI dashboard ----
  heading(labels.statusBreakdown);
  const kpiCards = [
    { value: run.totalTests, label: labels.totalTestCases, color: COLOR.textPrimary, bg: COLOR.bg },
    { value: run.passed, label: labels.passed, color: POSTMAN_STATUS_STRONG.passed, bg: POSTMAN_STATUS_BG.passed },
    { value: run.failed, label: labels.failed, color: POSTMAN_STATUS_STRONG.failed, bg: POSTMAN_STATUS_BG.failed },
    { value: run.broken, label: labels.broken, color: POSTMAN_STATUS_STRONG.broken, bg: POSTMAN_STATUS_BG.broken },
    { value: run.skipped, label: labels.skipped, color: POSTMAN_MUTED, bg: POSTMAN_STATUS_BG.skipped },
  ];
  const cardGap = 8;
  const cardHeight = 58;
  const cardWidth = (contentWidth - cardGap * (kpiCards.length - 1)) / kpiCards.length;
  ensureSpace(cardHeight + 10);
  kpiCards.forEach((card, index) => {
    const x = MARGIN + index * (cardWidth + cardGap);
    doc.setFillColor(...card.bg);
    doc.roundedRect(x, y, cardWidth, cardHeight, 5, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(...card.color);
    doc.text(String(card.value), x + cardWidth / 2, y + 28, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR.textSecondary);
    doc.text(card.label, x + cardWidth / 2, y + 44, { align: 'center' });
  });
  y += cardHeight + 20;

  // ---- Progress bar (--pass/--fail/--broken/--skip segments, same as the
  // HTML report's .progress-bar) ----
  const passRate = run.totalTests > 0 ? Math.round((run.passed / run.totalTests) * 100) : 0;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.textSecondary);
  ensureSpace(28);
  doc.text(labels.generalResult, MARGIN, y);
  const progressLabel = (labels.passRateDuration || '')
    .replace('{{rate}}', passRate)
    .replace('{{duration}}', run.durationMs === null || run.durationMs === undefined ? '—' : `${run.durationMs} ms`);
  doc.text(progressLabel, pageWidth - MARGIN, y, { align: 'right' });
  y += 8;
  const totalForBar = run.totalTests || 1;
  const barHeight = 8;
  let barX = MARGIN;
  doc.setFillColor(...POSTMAN_STATUS_BG.skipped);
  doc.roundedRect(MARGIN, y, contentWidth, barHeight, 4, 4, 'F');
  [
    { value: run.passed, color: POSTMAN_STATUS_STRONG.passed },
    { value: run.failed, color: POSTMAN_STATUS_STRONG.failed },
    { value: run.broken, color: POSTMAN_STATUS_STRONG.broken },
    { value: run.skipped, color: POSTMAN_STATUS_STRONG.skipped },
  ].forEach((segment) => {
    const width = (segment.value / totalForBar) * contentWidth;
    if (width > 0) {
      doc.setFillColor(...segment.color);
      doc.rect(barX, y, width, barHeight, 'F');
      barX += width;
    }
  });
  y += barHeight + 22;

  // ---- Test summary table ----
  heading(labels.caseSummaryTitle);
  autoTable(
    doc,
    Object.assign(
      tableDefaults(
        [labels.testCase, labels.method, labels.status, labels.durationMs],
        tests.map((testResult) => [
          testResult.suiteName
            ? `${testResult.suiteName} — ${testResult.testName}`
            : testResult.testName,
          testResult.method || '—',
          testResult.status,
          testResult.durationMs === null || testResult.durationMs === undefined
            ? '—'
            : `${testResult.durationMs} ms`,
        ]),
      ),
      {
        columnStyles: {
          0: { cellWidth: contentWidth * 0.55 },
          1: { cellWidth: contentWidth * 0.13, halign: 'center' },
          2: { cellWidth: contentWidth * 0.17, halign: 'center' },
          3: { cellWidth: contentWidth * 0.15, halign: 'center' },
        },
        didParseCell(cell) {
          if (cell.section === 'body' && cell.column.index === 2) {
            cell.cell.text = [];
          }
        },
        didDrawCell(cell) {
          if (cell.section !== 'body' || cell.column.index !== 2) return;
          const testResult = tests[cell.row.index];
          statusBadge(
            cell.cell.x + cell.cell.width / 2,
            cell.cell.y + cell.cell.height / 2,
            statusPillLabel(testResult.status),
            testResult.status,
          );
        },
      },
    ),
  );
  y = doc.lastAutoTable.finalY + 24;

  // ---- Test-by-test detail ----
  heading(labels.caseDetailsTitle);
  tests.forEach((testResult) => {
    // Same reasoning as generateCycleReportPdf's case loop: every test,
    // including the first, starts on its own fresh page rather than
    // sharing leftover room with the summary table above.
    doc.addPage();
    y = MARGIN;

    const TITLE_SIZE = 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(TITLE_SIZE);
    const titleLines = doc.splitTextToSize(
      testResult.suiteName
        ? `${testResult.suiteName} — ${testResult.testName}`
        : testResult.testName,
      contentWidth - 92,
    );
    const titleLineHeight = TITLE_SIZE * 1.2;
    ensureSpace(titleLines.length * titleLineHeight + 16);
    doc.setTextColor(...COLOR.textPrimary);
    doc.text(titleLines, MARGIN, y);
    statusBadge(
      pageWidth - MARGIN,
      y - 4,
      statusPillLabel(testResult.status),
      testResult.status,
      'right',
    );
    doc.setFont('helvetica', 'normal');
    y += titleLines.length * titleLineHeight + 14;

    // Method chip + URL + response-status chip, on one line — the PDF
    // equivalent of the HTML report's .test-header (.method-badge,
    // .request-line, .http-code).
    if (testResult.method || testResult.url) {
      ensureSpace(20);
      const lineCenterY = y + 1;
      const badgeWidth = methodBadge(MARGIN, lineCenterY, testResult.method);
      const hasResponseStatus =
        testResult.responseStatus !== null && testResult.responseStatus !== undefined;
      let codeWidth = 0;
      if (hasResponseStatus) {
        const codeLabel = String(testResult.responseStatus);
        doc.setFont('courier', 'bold');
        doc.setFontSize(9);
        codeWidth = doc.getTextWidth(codeLabel) + 14;
        doc.setFillColor(...COLOR.bg);
        doc.setDrawColor(...COLOR.border);
        doc.setLineWidth(0.75);
        doc.roundedRect(pageWidth - MARGIN - codeWidth, lineCenterY - 7.5, codeWidth, 15, 3, 3, 'FD');
        doc.setTextColor(...COLOR.textSecondary);
        doc.text(codeLabel, pageWidth - MARGIN - codeWidth / 2, lineCenterY + 3, { align: 'center' });
      }
      const urlX = badgeWidth ? MARGIN + badgeWidth + 8 : MARGIN;
      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLOR.textSecondary);
      const urlText = doc.splitTextToSize(
        testResult.url || '—',
        Math.max(contentWidth - badgeWidth - 8 - codeWidth - (codeWidth ? 8 : 0), 80),
      )[0];
      doc.text(urlText, urlX, lineCenterY + 3);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLOR.textPrimary);
      y += 24;
    }

    if (testResult.errorMessage) {
      subheading(labels.actualResult);
      paragraph(testResult.errorMessage, 9.5, POSTMAN_STATUS_TEXT.failed);
    }

    fieldBlock(labels.requestHeaders, testResult.requestHeaders);
    fieldBlock(labels.requestBody, testResult.requestBody);
    fieldBlock(labels.responseHeaders, testResult.responseHeaders);
    fieldBlock(labels.responseBody, testResult.responseBody);

    if (testResult.logs.length > 0) {
      subheading(labels.logs);
      codePanel(testResult.logs.join('\n'));
    }
  });

  return doc;
}
