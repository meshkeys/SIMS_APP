import type {
  AuditPage,
  Department,
  InvitationView,
  MemberAdmin,
  MemberAdminPage,
  OrganisationSettings,
} from '@sims/contracts';

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;

export const DEPARTMENTS: Department[] = [
  {
    id: id(11),
    name: 'Retail Banking',
    code: 'RTL',
    parentId: null,
    memberCount: 4,
  },
  {
    id: id(12),
    name: 'Branches',
    code: null,
    parentId: id(11),
    memberCount: 0,
  },
  { id: id(13), name: 'Finance', code: 'FIN', parentId: null, memberCount: 2 },
];

const member = (
  n: number,
  overrides: Partial<MemberAdmin> = {},
): MemberAdmin => ({
  membershipId: id(n),
  name: `Person ${n}`,
  email: `person${n}@meridian.example`,
  jobTitle: null,
  department: null,
  manager: null,
  roles: ['TASK_OWNER'],
  status: 'ACTIVE',
  joinedAt: '2026-02-01T09:00:00.000Z',
  responsibilities: { owns: 0, sponsors: 0, decisionsPending: 0 },
  can: { edit: true, deactivate: true, reactivate: false },
  ...overrides,
});

export const TUNDE = member(21, {
  name: 'Tunde Adeyemi',
  email: 'tunde.adeyemi@meridian.example',
  jobTitle: 'Head, Retail Banking',
  department: { id: id(11), name: 'Retail Banking' },
  roles: ['INITIATIVE_OWNER', 'EXECUTIVE_SPONSOR'],
  responsibilities: { owns: 3, sponsors: 1, decisionsPending: 2 },
});

export const ADMIN = member(22, {
  name: 'Ngozi Eze',
  roles: ['SYSTEM_ADMIN'],
  can: { edit: false, deactivate: false, reactivate: false },
});

export const FORMER = member(23, {
  name: 'Chidi Obi',
  status: 'DEACTIVATED',
  can: { edit: false, deactivate: false, reactivate: true },
});

export const membersPage = (items: MemberAdmin[]): MemberAdminPage => ({
  items,
  page: 1,
  pageSize: 25,
  total: items.length,
  counts: { ACTIVE: 2, INVITED: 0, DEACTIVATED: 1 },
});

export const INVITATION: InvitationView = {
  id: id(31),
  email: 'new.hire@meridian.example',
  roles: ['TASK_OWNER'],
  jobTitle: null,
  departmentId: null,
  status: 'PENDING',
  invitedBy: { id: id(32), name: 'Amara Bello' },
  createdAt: '2026-10-15T09:00:00.000Z',
  expiresAt: '2026-10-22T09:00:00.000Z',
  acceptedAt: null,
  revokedAt: null,
};

export const ORGANISATION: OrganisationSettings = {
  id: id(41),
  name: 'Meridian Financial Group',
  slug: 'meridian',
  sector: 'PRIVATE',
  country: 'NG',
  currency: 'NGN',
  timezone: 'Africa/Lagos',
  fiscalYearStartMonth: 1,
  status: 'ACTIVE',
  terminology: {
    kpi: 'KPI',
    initiative: 'Initiative',
    milestone: 'Milestone',
    task: 'Task',
  },
  createdAt: '2025-11-01T09:00:00.000Z',
};

export const AUDIT: AuditPage = {
  items: [
    {
      id: id(51),
      at: '2026-10-18T14:30:00.000Z',
      actor: { membershipId: id(52), name: 'Amara Bello', jobTitle: null },
      action: 'ORGANISATION_UPDATED',
      actionLabel: 'Organisation updated',
      entityType: 'Organisation',
      entityId: id(41),
      before: { currency: 'USD' },
      after: { currency: 'NGN' },
    },
    {
      id: id(53),
      at: '2026-10-18T02:00:00.000Z',
      actor: null,
      action: 'ESCALATED',
      actionLabel: 'Escalated',
      entityType: 'Escalation',
      entityId: id(54),
      before: null,
      after: null,
    },
  ],
  page: 1,
  pageSize: 50,
  total: 2,
  actions: ['ESCALATED', 'ORGANISATION_UPDATED'],
  entityTypes: ['Escalation', 'Organisation'],
};
