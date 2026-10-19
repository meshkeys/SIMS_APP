import { z } from 'zod';
import { isoDateTime, personRefSchema } from './common.js';

/** A stored file (evidence on a milestone). Bytes are fetched with downloadDocument. */
export const documentViewSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.int().min(0),
  uploadedBy: personRefSchema.nullable(),
  uploadedAt: isoDateTime,
  /** Checked by the Strategy Office when it verified an update. */
  reviewed: z.boolean(),
  can: z.object({
    /** The uploader or the Strategy Office, until it has been reviewed. */
    delete: z.boolean(),
  }),
});
export type DocumentView = z.infer<typeof documentViewSchema>;

/** File types accepted as evidence (checked against the file's content too). */
export const EVIDENCE_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'docx',
  'xlsx',
  'pptx',
  'csv',
  'txt',
] as const;
