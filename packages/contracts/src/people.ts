import { z } from 'zod';
import { pageMeta } from './common.js';
import { Role } from './enums.js';

// ---------------------------------------------------------------------------
// People directory: for owner, sponsor and assignee pickers
// ---------------------------------------------------------------------------

export const memberQuerySchema = z.object({
  /** Matches name, email or job title. */
  q: z.string().trim().min(1).max(100).optional(),
  /** Only people holding this role (e.g. EXECUTIVE_SPONSOR for a sponsor picker). */
  role: z.enum(Role).optional(),
  departmentId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type MemberQuery = z.output<typeof memberQuerySchema>;

/** An active member of the organisation, as a picker shows them. */
export const memberSchema = z.object({
  membershipId: z.uuid(),
  name: z.string(),
  /** Tells apart two people with the same name. */
  email: z.string(),
  jobTitle: z.string().nullable(),
  department: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  roles: z.array(z.enum(Role)),
});
export type Member = z.infer<typeof memberSchema>;

export const memberPageSchema = z.object({
  items: z.array(memberSchema),
  ...pageMeta,
});
export type MemberPage = z.infer<typeof memberPageSchema>;

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export const departmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  code: z.string().nullable(),
  /** Departments can nest (e.g. Retail → Branches). */
  parentId: z.uuid().nullable(),
  /** Active members in this department (not counting sub-departments). */
  memberCount: z.int().min(0),
});
export type Department = z.infer<typeof departmentSchema>;
