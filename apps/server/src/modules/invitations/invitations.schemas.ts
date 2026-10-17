import { z } from 'zod';
import { Role } from '../../generated/prisma/enums.js';
import { emailSchema } from '../auth/auth.schemas.js';

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
 * the invitee has no account yet; that check happens in the service once
 * the invitation is known.
 */
export const acceptInvitationSchema = invitationTokenSchema.extend({
  name: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(1).max(128),
});
export type AcceptInvitationInput = z.output<typeof acceptInvitationSchema>;

export const invitationIdSchema = z.uuid();
