const { buildRawReportUpload } = require('../../src/services/rawReportBundle.service');

describe('buildRawReportUpload', () => {
  test('passes a single file through unchanged', () => {
    const file = {
      buffer: Buffer.from('{}'),
      mimetype: 'application/json',
      originalname: 'result.json',
    };
    const upload = buildRawReportUpload([file]);

    expect(upload.buffer).toBe(file.buffer);
    expect(upload.contentType).toBe('application/json');
    expect(upload.filename).toBe('result.json');
  });

  test('bundles multiple files into a single JSON manifest', () => {
    const files = [
      { buffer: Buffer.from('{"a":1}'), originalname: 'a.json' },
      { buffer: Buffer.from('{"b":2}'), originalname: 'b.json' },
    ];
    const upload = buildRawReportUpload(files);
    const manifest = JSON.parse(upload.buffer.toString('utf8'));

    expect(manifest).toHaveLength(2);
    expect(manifest[0]).toEqual({ filename: 'a.json', content: '{"a":1}' });
    expect(manifest[1]).toEqual({ filename: 'b.json', content: '{"b":2}' });
    expect(upload.contentType).toBe('application/json');
    expect(upload.filename).toBe('allure-results-bundle.json');
  });
});
