import { checkUpload, cleanFileName } from './upload-rules.js';

const MB = 1_048_576;
const pdf = Buffer.from('%PDF-1.7\n...');
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

describe('checkUpload', () => {
  const check = (originalName: string, head: Buffer, size = head.length) =>
    checkUpload({ originalName, size, head }, 20 * MB);

  it('accepts allowed types whose content matches', () => {
    expect(check('Sprint 14 report.pdf', pdf)).toEqual({
      ok: true,
      fileName: 'Sprint 14 report.pdf',
      mimeType: 'application/pdf',
    });
    expect(check('Test plan.DOCX', zip)).toMatchObject({
      ok: true,
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(check('figures.csv', Buffer.from('a,b\n1,2'))).toMatchObject({
      ok: true,
      mimeType: 'text/csv',
    });
  });

  it('refuses other types and renamed files', () => {
    expect(check('setup.exe', exe)).toMatchObject({
      ok: false,
      code: 'FILE_TYPE_NOT_ALLOWED',
    });
    expect(check('report.pdf', exe)).toEqual({
      ok: false,
      code: 'FILE_CONTENT_MISMATCH',
      message: 'report.pdf does not look like a PDF file.',
    });
    expect(check('notes.txt', Buffer.from([0x41, 0x00, 0x42]))).toMatchObject({
      code: 'FILE_CONTENT_MISMATCH',
    });
    expect(check('no-extension', pdf)).toMatchObject({
      code: 'FILE_TYPE_NOT_ALLOWED',
    });
  });

  it('refuses empty and oversized files', () => {
    expect(check('empty.pdf', Buffer.alloc(0))).toMatchObject({
      code: 'FILE_EMPTY',
    });
    expect(check('huge.pdf', pdf, 21 * MB)).toEqual({
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: 'Files can be up to 20 MB.',
    });
  });
});

describe('cleanFileName', () => {
  it('drops folders and unsafe characters, keeping the extension', () => {
    expect(cleanFileName('../../Q3 report?.pdf')).toBe('Q3 report_.pdf');
    expect(cleanFileName('C:\\Users\\me\\minutes.docx')).toBe('minutes.docx');
    expect(cleanFileName('.hidden')).toBe('hidden');
    expect(cleanFileName('')).toBe('file');
    const long = `${'a'.repeat(300)}.pdf`;
    expect(cleanFileName(long)).toHaveLength(200);
    expect(cleanFileName(long).endsWith('.pdf')).toBe(true);
  });
});
