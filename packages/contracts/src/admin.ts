import { z } from 'zod';
import {
  clearableText,
  commaList,
  isoDate,
  isoDateTime,
  pageMeta,
  personRefSchema,
} from './common.js';
import {
  MembershipStatus,
  OrganisationSector,
  OrganisationStatus,
  Role,
} from './enums.js';

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export const memberAdminQuerySchema = z.object({
  /** Default: active and invited. */
  status: commaList(['ACTIVE', 'INVITED', 'DEACTIVATED']).optional(),
  q: z.string().trim().min(1).max(100).optional(),
  role: z.enum(Role).optional(),
  departmentId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type MemberAdminQuery = z.output<typeof memberAdminQuerySchema>;

export const updateMemberSchema = z
  .object({
    roles: z
      .array(z.enum(Role))
      .min(1, 'Keep at least one role')
      .max(8)
      .transform((roles) => [...new Set(roles)]),
    jobTitle: clearableText(120),
    departmentId: z.uuid().nullable(),
    managerId: z.uuid().nullable(),
  })
  .partial()
  .refine((m) => Object.keys(m).length > 0, 'Nothing to update');
export type UpdateMemberInput = z.output<typeof updateMemberSchema>;

export const memberAdminSchema = z.object({
  membershipId: z.uuid(),
  name: z.string(),
  email: z.string(),
  jobTitle: z.string().nullable(),
  department: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  manager: personRefSchema.nullable(),
  roles: z.array(z.enum(Role)),
  status: z.enum(MembershipStatus),
  joinedAt: isoDateTime.nullable(),
  /** What they are accountable for, so it can be handed over before deactivating. */
  responsibilities: z.object({
    owns: z.int().min(0),
    sponsors: z.int().min(0),
    decisionsPending: z.int().min(0),
  }),
  can: z.object({
    edit: z.boolean(),
    deactivate: z.boolean(),
    reactivate: z.boolean(),
  }),
});
export type MemberAdmin = z.infer<typeof memberAdminSchema>;

export const memberAdminPageSchema = z.object({
  items: z.array(memberAdminSchema),
  ...pageMeta,
  counts: z.object({
    ACTIVE: z.int().min(0),
    INVITED: z.int().min(0),
    DEACTIVATED: z.int().min(0),
  }),
});
export type MemberAdminPage = z.infer<typeof memberAdminPageSchema>;

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(1).max(20).nullable().default(null),
  parentId: z.uuid().nullable().default(null),
});
export type CreateDepartmentInput = z.output<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().min(1).max(20).nullable(),
    parentId: z.uuid().nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');
export type UpdateDepartmentInput = z.output<typeof updateDepartmentSchema>;

// ---------------------------------------------------------------------------
// Organisation settings
// ---------------------------------------------------------------------------

export const organisationSettingsSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** Workspace address; fixed once created. */
  slug: z.string(),
  sector: z.enum(OrganisationSector),
  country: z.string(),
  currency: z.string(),
  timezone: z.string(),
  fiscalYearStartMonth: z.int().min(1).max(12),
  status: z.enum(OrganisationStatus),
  /** What the organisation calls KPIs, initiatives, milestones and tasks. */
  terminology: z.object({
    kpi: z.string(),
    initiative: z.string(),
    milestone: z.string(),
    task: z.string(),
  }),
  createdAt: isoDateTime,
});
export type OrganisationSettings = z.infer<typeof organisationSettingsSchema>;

const label = z.string().trim().min(2).max(40);

export const updateOrganisationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    country: z
      .string()
      .trim()
      .length(2, 'Use the two-letter country code')
      .toUpperCase(),
    /** ISO 4217, e.g. NGN, KES, USD. */
    currency: z.string().trim().length(3).toUpperCase(),
    /** IANA time zone, e.g. Africa/Lagos. */
    timezone: z.string().trim().min(3).max(60),
    fiscalYearStartMonth: z.int().min(1).max(12),
    terminology: z.object({
      kpi: label,
      initiative: label,
      milestone: label,
      task: label,
    }),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update');
export type UpdateOrganisationInput = z.output<typeof updateOrganisationSchema>;

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export const auditQuerySchema = z.object({
  action: z.string().trim().min(1).max(60).optional(),
  entityType: z.string().trim().min(1).max(60).optional(),
  entityId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  /** Inclusive dates, in the organisation's calendar (UTC days). */
  from: isoDate.optional(),
  to: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditQuery = z.output<typeof auditQuerySchema>;

export const auditEventSchema = z.object({
  id: z.uuid(),
  at: isoDateTime,
  /** Null for the system (e.g. automatic escalation). */
  actor: personRefSchema.nullable(),
  action: z.string(),
  /** "Ruleset proposed", "Escalated"… */
  actionLabel: z.string(),
  entityType: z.string(),
  entityId: z.uuid(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});
export type AuditEventView = z.infer<typeof auditEventSchema>;

export const auditPageSchema = z.object({
  items: z.array(auditEventSchema),
  ...pageMeta,
  /** Every action and entity type recorded, for the filters. */
  actions: z.array(z.string()),
  entityTypes: z.array(z.string()),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

/** Roles that may read the audit log. */
export const AUDIT_READER_ROLES = [
  'SYSTEM_ADMIN',
  'STRATEGY_OFFICE',
  'INTERNAL_AUDIT',
] as const satisfies readonly Role[];
