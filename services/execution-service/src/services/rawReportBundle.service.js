// AutomationRun.rawReportUrl is a single String, but Allure ships one file
// per test (allure-results/*.json) — bundle multiple raw files into a single
// uploadable JSON manifest so there's always exactly one S3 object to point
// rawReportUrl at. A single-file upload (Newman's case, or a tiny Allure run)
// passes straight through unchanged.
function buildRawReportUpload(files) {
  if (files.length === 1) {
    return {
      buffer: files[0].buffer,
      contentType: files[0].mimetype || 'application/json',
      filename: files[0].originalname,
    };
  }

  const manifest = files.map((file) => ({
    filename: file.originalname,
    content: file.buffer.toString('utf8'),
  }));

  return {
    buffer: Buffer.from(JSON.stringify(manifest)),
    contentType: 'application/json',
    filename: 'allure-results-bundle.json',
  };
}

module.exports = { buildRawReportUpload };
