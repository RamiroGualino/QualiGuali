// Hand-rolled mini-format for packing a TestCase's steps array into a
// single "Detailed Steps" CSV cell (and back), since the Kualitee-style
// import/export template has one column for all steps, not one column per
// step. One action per line, plain text — no embedded numbering (steps are
// numbered for display only, in the form's gutter, never in the stored
// text itself).
// Matches a leading "1) " or "1. " — either is common in text pasted from
// elsewhere (a Kualitee export, a numbered list written outside the app).
// Without stripping it, the number survives into the stored action text and
// doubles up with the display-only numbering the app adds on top (steps
// list, NumberedTextArea's gutter), rendering as "1. 1. Do the thing".
const LEGACY_STEP_LINE_PATTERN = /^\d+[).]\s*/;
const LEGACY_STEP_SEPARATOR = ' || ';

export function serializeSteps(steps = []) {
  return steps.map((step) => step.action).join('\n');
}

// Same stripping parseStepsText does at import time, exposed for display
// code that renders step.action directly — a defensive net for steps that
// were imported before this stripping existed and still carry the legacy
// number baked into the stored text.
export function stripLegacyStepNumber(action = '') {
  return action.replace(LEGACY_STEP_LINE_PATTERN, '');
}

// Also strips the old "N) action || expected result" format (pre-dating
// the single-field steps UI) so a CSV exported before that change still
// re-imports cleanly — the expected-result half is simply dropped, since
// that's no longer a field this app collects per step.
export function parseStepsText(text = '') {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const withoutNumber = line.replace(LEGACY_STEP_LINE_PATTERN, '');
      const [action] = withoutNumber.split(LEGACY_STEP_SEPARATOR);
      return { order: index + 1, action: action.trim(), expectedResult: '' };
    });
}
