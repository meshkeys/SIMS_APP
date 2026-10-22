import { z } from 'zod';
import { isoDateTime } from './common.js';
import { OrganisationSector, OrganisationStatus, Role } from './enums.js';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

/** Trimmed and lower-cased before validation, so "  Ada@Example.com " is accepted. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

/** Length over complexity rules (NIST SP 800-63B). */
export const newPasswordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Use at most 128 characters');

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/,
    'Use 3–63 lowercase letters, numbers or hyphens, not starting or ending with a hyphen',
  );

const isTimeZone = (value: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const signupSchema = z.object({
  organisationName: z.string().trim().min(2).max(120),
  /** Workspace address; derived from the name when omitted. */
  organisationSlug: slugSchema.optional(),
  sector: z.enum(OrganisationSector),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'Use a two-letter country code, e.g. NG'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use a three-letter currency code, e.g. NGN')
    .default('NGN'),
  timezone: z
    .string()
    .trim()
    .refine(isTimeZone, 'Unknown time zone')
    .default('Africa/Lagos'),
  name: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120).optional(),
  email: emailSchema,
  password: newPasswordSchema,
});
export type SignupInput = z.output<typeof signupSchema>;

// ---------------------------------------------------------------------------
// Forgot password
// ---------------------------------------------------------------------------

/** Minutes a "forgot password" link stays valid. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

export const passwordResetRequestSchema = z.object({ email: emailSchema });
export type PasswordResetRequestInput = z.output<
  typeof passwordResetRequestSchema
>;

/** Tokens travel in request bodies, never URLs, so they stay out of access logs. */
export const passwordResetTokenSchema = z.object({
  token: z.string().min(20).max(200),
});
export type PasswordResetTokenInput = z.output<typeof passwordResetTokenSchema>;

export const passwordResetCompleteSchema = passwordResetTokenSchema.extend({
  password: newPasswordSchema,
});
export type PasswordResetCompleteInput = z.output<
  typeof passwordResetCompleteSchema
>;

/** What the "choose a new password" page shows before the password is set. */
export const passwordResetPreviewSchema = z.object({
  email: z.string(),
  expiresAt: isoDateTime,
});
export type PasswordResetPreview = z.infer<typeof passwordResetPreviewSchema>;

// ---------------------------------------------------------------------------
// Confirming an email address
// ---------------------------------------------------------------------------

/** Days a "confirm your email" link stays valid. */
export const EMAIL_VERIFICATION_TTL_DAYS = 7;

export const emailVerificationTokenSchema = z.object({
  token: z.string().min(20).max(200),
});
export type EmailVerificationTokenInput = z.output<
  typeof emailVerificationTokenSchema
>;

export const emailVerificationResultSchema = z.object({
  email: z.string(),
});
export type EmailVerificationResult = z.infer<
  typeof emailVerificationResultSchema
>;

export const loginSchema = z.object({
  email: emailSchema,
  // No strength rules at login: they would reveal the policy to attackers
  // and lock out users with older passwords.
  password: z.string().min(1).max(128),
  /** Which workspace to open when the user belongs to several. */
  organisationSlug: slugSchema.optional(),
});
export type LoginInput = z.output<typeof loginSchema>;

export const switchOrganisationSchema = z.object({
  organisationId: z.uuid(),
});
export type SwitchOrganisationInput = z.output<typeof switchOrganisationSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const sessionViewSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string(),
    /** False until the "confirm your email" link is opened. */
    emailVerified: z.boolean(),
  }),
  organisation: z.object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    status: z.enum(OrganisationStatus),
    currency: z.string(),
    timezone: z.string(),
    /** The organisation's own words for things (e.g. "Pillar" → "Theme"). */
    terminology: z.unknown(),
    onboardingStep: z.int(),
  }),
  membership: z.object({
    id: z.uuid(),
    roles: z.array(z.enum(Role)),
    jobTitle: z.string().nullable(),
  }),
  /** Every workspace the user can switch to. */
  organisations: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      slug: z.string(),
      roles: z.array(z.enum(Role)),
    }),
  ),
});
export type SessionView = z.infer<typeof sessionViewSchema>;

/**
 * Returned by sign-up, sign-in, refresh, switch and invitation acceptance.
 * The refresh token travels separately, in an httpOnly cookie.
 */
export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: isoDateTime,
  session: sessionViewSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
