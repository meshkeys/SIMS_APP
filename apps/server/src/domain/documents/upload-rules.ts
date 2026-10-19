/**
 * What may be uploaded as evidence. The type comes from the file's extension
 * and must match the file's first bytes, so a renamed executable or script
 * is refused whatever the browser claims it is. Files are always served back
 * as downloads, never shown inline.
 */

type Sniff = (head: Buffer) => boolean;

const startsWith =
  (...bytes: number[]): Sniff =>
  (head) =>
    bytes.every((b, i) => head[i] === b);
/** Office documents (docx, xlsx, pptx) are zip files. */
const zip = startsWith(0x50, 0x4b, 0x03, 0x04);
/** Plain text: no NUL bytes in the first few kilobytes. */
const text: Sniff = (head) => !head.subarray(0, 4096).includes(0);

export const ALLOWED_TYPES: Record<
  string,
  { mimeType: string; label: string; sniff: Sniff }
> = {
  pdf: {
    mimeType: 'application/pdf',
    label: 'PDF',
    sniff: startsWith(0x25, 0x50, 0x44, 0x46, 0x2d), // %PDF-
  },
  png: {
    mimeType: 'image/png',
    label: 'PNG',
    sniff: startsWith(0x89, 0x50, 0x4e, 0x47),
  },
  jpg: {
    mimeType: 'image/jpeg',
    label: 'JPEG',
    sniff: startsWith(0xff, 0xd8, 0xff),
  },
  jpeg: {
    mimeType: 'image/jpeg',
    label: 'JPEG',
    sniff: startsWith(0xff, 0xd8, 0xff),
  },
  docx: {
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    label: 'Word',
    sniff: zip,
  },
  xlsx: {
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    label: 'Excel',
    sniff: zip,
  },
  pptx: {
    mimeType:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    label: 'PowerPoint',
    sniff: zip,
  },
  csv: { mimeType: 'text/csv', label: 'CSV', sniff: text },
  txt: { mimeType: 'text/plain', label: 'text', sniff: text },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_TYPES);

export type UploadCheck =
  | { ok: true; fileName: string; mimeType: string }
  | {
      ok: false;
      code:
        | 'FILE_EMPTY'
        | 'FILE_TOO_LARGE'
        | 'FILE_TYPE_NOT_ALLOWED'
        | 'FILE_CONTENT_MISMATCH';
      message: string;
    };

/**
 * A safe display name: no folders, no control or reserved characters, at
 * most 200 characters, extension kept. "../../Q3 report?.pdf" → "Q3 report_.pdf".
 */
export function cleanFileName(original: string): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  // oxlint-disable-next-line no-control-regex -- control characters are exactly what is being removed
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim();
  const name = cleaned.replace(/^\.+/, '') || 'file';
  if (name.length <= 200) return name;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot) : '';
  return name.slice(0, 200 - extension.length) + extension;
}

export function checkUpload(
  file: { originalName: string; size: number; head: Buffer },
  maxBytes: number,
): UploadCheck {
  if (file.size === 0)
    return { ok: false, code: 'FILE_EMPTY', message: 'The file is empty.' };
  if (file.size > maxBytes) {
    return {
      ok: false,
      code: 'FILE_TOO_LARGE',
      message: `Files can be up to ${Math.floor(maxBytes / 1_048_576)} MB.`,
    };
  }
  const fileName = cleanFileName(file.originalName);
  const extension = fileName.includes('.')
    ? fileName.split('.').pop()!.toLowerCase()
    : '';
  const type = ALLOWED_TYPES[extension];
  if (!type) {
    return {
      ok: false,
      code: 'FILE_TYPE_NOT_ALLOWED',
      message: `Upload a PDF, image (PNG, JPEG), Word, Excel, PowerPoint, CSV or text file.`,
    };
  }
  if (!type.sniff(file.head)) {
    return {
      ok: false,
      code: 'FILE_CONTENT_MISMATCH',
      message: `${fileName} does not look like a ${type.label} file.`,
    };
  }
  return { ok: true, fileName, mimeType: type.mimeType };
}
