const { parseAllureResults, isAllureResult } = require('../parsers/allureParser');
const { parseNewmanReport, isNewmanReport } = require('../parsers/newmanParser');

const SUPPORTED_TOOLS = ['allure', 'newman'];

// Detects the tool from an explicit "tool" field if given, otherwise from
// the shape of the uploaded JSON payload(s) — never guesses when the shape
// is ambiguous, it fails with a clear 400 instead.
function detectTool(explicitTool, parsedFiles) {
  if (explicitTool) {
    if (!SUPPORTED_TOOLS.includes(explicitTool)) {
      const err = new Error(
        `Unknown tool "${explicitTool}". Must be one of: ${SUPPORTED_TOOLS.join(', ')}`,
      );
      err.status = 400;
      throw err;
    }
    return explicitTool;
  }

  if (parsedFiles.length === 1 && isNewmanReport(parsedFiles[0])) {
    return 'newman';
  }

  if (parsedFiles.length > 0 && parsedFiles.every(isAllureResult)) {
    return 'allure';
  }

  const err = new Error(
    'Unrecognized report format. Provide "tool": "allure"|"newman" explicitly, or check that the uploaded file(s) match the expected format.',
  );
  err.status = 400;
  throw err;
}

function detectAndParse(explicitTool, parsedFiles) {
  const tool = detectTool(explicitTool, parsedFiles);
  const result =
    tool === 'newman' ? parseNewmanReport(parsedFiles[0]) : parseAllureResults(parsedFiles);
  return { tool, ...result };
}

module.exports = { detectAndParse, detectTool };
