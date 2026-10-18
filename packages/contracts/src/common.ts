import { z } from 'zod';

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

export const idSchema = z.uuid();

/** Calendar date, e.g. "2026-12-31". */
export const isoDate = z.iso.date('Use a date like 2026-12-31');

/** Instant in UTC, e.g. "2026-10-16T09:00:00.000Z". */
export const isoDateTime = z.iso.datetime();

/** Optional long text: "" or null clears it. */
export const clearableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value ? value : null));

/** Organisation-wide codes: P1, O1.2, DIG-004, K01… */
export const codeSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9.-]{0,19}$/,
    'Use up to 20 letters, digits, dots or hyphens',
  );

/** "RED,AMBER" → ['RED', 'AMBER'] (query strings). */
export const commaList = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim().toUpperCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(values)));

export const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
};

// ---------------------------------------------------------------------------
// Shared response pieces
// ---------------------------------------------------------------------------

/** A member, as shown next to anything they own, sponsor or did. */
export const personRefSchema = z.object({
  membershipId: z.uuid(),
  name: z.string(),
  jobTitle: z.string().nullable(),
});
export type PersonRef = z.infer<typeof personRefSchema>;

/** A pillar, objective or other strategy element, by name. */
export const elementRefSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
});
export type ElementRef = z.infer<typeof elementRefSchema>;

export const initiativeRefSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  title: z.string(),
});
export type InitiativeRef = z.infer<typeof initiativeRefSchema>;

/** Offset-paged lists: "Page 1 of 4". */
export const pageMeta = {
  page: z.int().min(1),
  pageSize: z.int().min(1),
  total: z.int().min(0),
};

// ---------------------------------------------------------------------------
// Errors (RFC 9457 Problem Details)
// ---------------------------------------------------------------------------

export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int(),
  /** Stable machine-readable code, e.g. "PERIOD_NOT_FOUND". */
  code: z.string(),
  detail: z.string().optional(),
  /** The request path that failed. */
  instance: z.string(),
  /** Quote this to support; it is in the server logs. */
  requestId: z.string().optional(),
  /** Field-level validation errors (400 VALIDATION_FAILED). */
  errors: z
    .array(
      z.object({
        /** Dotted path of the field, e.g. "lines.0.claimedCompletion". */
        path: z.string(),
        message: z.string(),
        code: z.string(),
      }),
    )
    .optional(),
});
export type Problem = z.infer<typeof problemSchema>;
