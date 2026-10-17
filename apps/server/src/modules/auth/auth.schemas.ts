import { z } from 'zod';
import { OrganisationSector } from '../../generated/prisma/enums.js';

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
