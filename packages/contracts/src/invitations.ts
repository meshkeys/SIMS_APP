import { z } from 'zod';
import { emailSchema } from './auth.js';
import { isoDateTime } from './common.js';
import { Role } from './enums.js';

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const createInvitationSchema = z.object({
  email: emailSchema,
  roles: z
    .array(z.enum(Role))
    .min(1, 'Choose at least one role')
    .max(8)
    .transform((roles) => [...new Set(roles)]),
  jobTitle: z.string().trim().min(1).max(120).optional(),
  departmentId: z.uuid().optional(),
});
export type CreateInvitationInput = z.output<typeof createInvitationSchema>;

/** Tokens travel in request bodies, never URLs, so they stay out of access logs. */
export const invitationTokenSchema = z.object({
  token: z.string().min(20).max(200),
});
export type InvitationTokenInput = z.output<typeof invitationTokenSchema>;

/**
 * `name` is required, and `password` must meet the strength rules, only when
 * the invitee has no account yet; that check happens on the server once
 * the invitation is known.
 */
export const acceptInvitationSchema = invitationTokenSchema.extend({
  name: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(1).max(128),
});
export type AcceptInvitationInput = z.output<typeof acceptInvitationSchema>;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export const INVITATION_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED',
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const invitationViewSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  roles: z.array(z.enum(Role)),
  jobTitle: z.string().nullable(),
  departmentId: z.uuid().nullable(),
  status: z.enum(INVITATION_STATUSES),
  invitedBy: z.object({ id: z.uuid(), name: z.string() }),
  createdAt: isoDateTime,
  expiresAt: isoDateTime,
  acceptedAt: isoDateTime.nullable(),
  revokedAt: isoDateTime.nullable(),
});
export type InvitationView = z.infer<typeof invitationViewSchema>;

export const sentInvitationSchema = invitationViewSchema.extend({
  /** False when the email could not be sent: the invitation exists; resend later. */
  emailDelivered: z.boolean(),
});
export type SentInvitation = z.infer<typeof sentInvitationSchema>;

/** What the acceptance page shows before the invitee signs in or signs up. */
export const invitationPreviewSchema = z.object({
  organisationName: z.string(),
  email: z.string(),
  roles: z.array(z.enum(Role)),
  jobTitle: z.string().nullable(),
  invitedByName: z.string(),
  expiresAt: isoDateTime,
  /** true → ask for the existing password; false → ask for a name and new password. */
  accountExists: z.boolean(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;
