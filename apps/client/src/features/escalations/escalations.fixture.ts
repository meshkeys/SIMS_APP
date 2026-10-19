import type {
  DecisionPage,
  EscalationCentre,
  EscalationDetail,
  EscalationItem,
  PortfolioDependency,
  RiskRegister,
  RiskView,
} from '@sims/contracts';

const id = (n: number) =>
  `0192a1b2-c3d4-7e5f-8a9b-${String(n).padStart(12, '0')}`;

export const ESC_CORE = id(301);
export const ESC_VENDOR = id(302);
export const ESC_UPDATE = id(303);
export const RISK_SEC = id(401);
export const DIG_004 = id(501);
const DIG_007 = id(502);
const DIG_011 = id(503);
const CX_004 = id(504);
const REV_005 = id(505);

const ref = (initiativeId: string, code: string, title: string) => ({
  id: initiativeId,
  code,
  title,
});

const item = (
  escalationId: string,
  reference: string,
  title: string,
  level: number,
  levelName: string,
  ageDays: number,
  extra: Partial<EscalationItem>,
): EscalationItem => ({
  id: escalationId,
  reference,
  title,
  severity: 'HIGH',
  level,
  levelName,
  daysAtLevel: 2,
  ageDays,
  initiative: null,
  decisionFrom: null,
  decisionFromRole: null,
  source: 'MANUAL',
  status: 'OPEN',
  raisedAt: '2026-09-25T09:00:00.000Z',
  raisedBy: null,
  riskIssue: null,
  dependency: null,
  nextLevelInDays: null,
  resolvedAt: null,
  resolution: null,
  can: { escalate: true, deEscalate: true, resolve: true, withdraw: true },
  ...extra,
});

export const CORE_BANKING = item(
  ESC_CORE,
  'ESC-0001',
  'Core banking API not ready for integration testing',
  3,
  'MD/CEO · EXCO',
  21,
  {
    severity: 'CRITICAL',
    source: 'RISK_ISSUE',
    riskIssue: { id: id(402), type: 'ISSUE', title: 'API not ready' },
    initiative: ref(DIG_007, 'DIG-007', 'Customer Onboarding'),
    decisionFrom: {
      membershipId: id(901),
      name: 'Adaeze Okafor',
      jobTitle: 'Group Managing Director',
    },
    decisionFromRole: 'CEO',
  },
);

export const VENDOR = item(
  ESC_VENDOR,
  'ESC-0003',
  'Vendor contract unsigned',
  2,
  'Executive sponsor',
  9,
  {
    source: 'RISK_ISSUE',
    riskIssue: { id: id(403), type: 'ISSUE', title: 'Vendor unsigned' },
    initiative: ref(DIG_004, 'DIG-004', 'Digital Investment Platform'),
    decisionFrom: {
      membershipId: id(902),
      name: 'Tunde Bakare',
      jobTitle: 'ED, Business',
    },
    nextLevelInDays: 5,
  },
);

export const MISSED_UPDATE = item(
  ESC_UPDATE,
  'ESC-0006',
  'October update not submitted',
  1,
  'Initiative owner',
  3,
  {
    severity: 'MEDIUM',
    source: 'MISSED_UPDATE',
    initiative: ref(CX_004, 'CX-004', 'Complaints System'),
    decisionFromRole: null,
    decisionFrom: {
      membershipId: id(903),
      name: 'Ngozi Eze',
      jobTitle: null,
    },
    nextLevelInDays: 4,
  },
);

export const CENTRE: EscalationCentre = {
  ladder: [
    {
      level: 1,
      name: 'Initiative owner',
      description: 'Resolve within 7 days',
      decidedBy: { type: 'INITIATIVE_OWNER' },
      autoEscalateAfterDays: 0,
      open: 1,
    },
    {
      level: 2,
      name: 'Executive sponsor',
      description: 'Unresolved after 7 days',
      decidedBy: { type: 'INITIATIVE_SPONSOR' },
      autoEscalateAfterDays: 7,
      open: 1,
    },
    {
      level: 3,
      name: 'MD/CEO · EXCO',
      description: 'Unresolved after 14 days or critical',
      decidedBy: { type: 'ROLE', role: 'CEO' },
      autoEscalateAfterDays: 14,
      open: 1,
    },
    {
      level: 4,
      name: 'Board',
      description: 'Strategic plan impact, by EXCO decision',
      decidedBy: { type: 'ROLE', role: 'BOARD' },
      autoEscalateAfterDays: null,
      open: 0,
    },
  ],
  criticalStartsAtLevel: 3,
  items: [CORE_BANKING, VENDOR, MISSED_UPDATE],
  total: 3,
  can: { raisePortfolio: true },
};

export const CORE_DETAIL: EscalationDetail = {
  ...CORE_BANKING,
  description: 'Sandbox still returns stubbed responses.',
  history: [
    {
      fromLevel: null,
      toLevel: 3,
      toLevelName: 'MD/CEO · EXCO',
      reason: 'CRITICAL_SEVERITY',
      note: null,
      actor: { membershipId: id(904), name: 'Amara Bello', jobTitle: null },
      at: '2026-09-25T09:00:00.000Z',
    },
  ],
};

const risk = (
  riskId: string,
  title: string,
  likelihood: number,
  impact: number,
  escalation: RiskView['escalation'],
): RiskView => ({
  id: riskId,
  type: 'RISK',
  title,
  description: null,
  likelihood,
  impact,
  score: likelihood * impact,
  severity: 'HIGH',
  status: 'OPEN',
  initiative: ref(DIG_004, 'DIG-004', 'Digital Investment Platform'),
  owner: {
    membershipId: id(905),
    name: 'Hassan Danjuma',
    jobTitle: 'Head, Digital Business',
  },
  mitigation: null,
  dueDate: null,
  closedAt: null,
  escalation,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
});

export const SEC_RISK = risk(
  RISK_SEC,
  'SEC product approval may slip',
  3,
  4,
  null,
);
const ESCALATED_RISK = risk(id(404), 'Low adoption', 3, 4, {
  reference: 'ESC-0005',
  level: 1,
});

const register = (items: RiskView[]): RiskRegister => ({
  items,
  page: 1,
  pageSize: 20,
  total: items.length,
  totalPages: 1,
  heatmap: [
    [0, 1, 2, 1, 1],
    [0, 1, 2, 2, 1],
    [1, 2, 4, 2, 0],
    [2, 3, 2, 1, 0],
    [1, 1, 0, 0, 0],
  ],
  counts: {
    risks: 31,
    issues: 6,
    bySeverity: { LOW: 8, MEDIUM: 12, HIGH: 8, CRITICAL: 3 },
  },
});

export const REGISTER = register([]);
/** Likelihood 3 × impact 4: two risks, one already escalated. */
export const CELL_REGISTER = register([SEC_RISK, ESCALATED_RISK]);

export const DEPENDENCIES: PortfolioDependency[] = [
  {
    id: id(601),
    from: ref(DIG_007, 'DIG-007', 'Customer Onboarding'),
    to: ref(DIG_011, 'DIG-011', 'Core Banking API'),
    description: null,
    status: 'BLOCKED',
    isCriticalPath: true,
    blockedSince: '2026-09-25T00:00:00.000Z',
    neededBy: null,
  },
  {
    id: id(602),
    from: ref(REV_005, 'REV-005', 'Bancassurance Product Bundle'),
    to: ref(DIG_004, 'DIG-004', 'Digital Investment Platform'),
    description: null,
    status: 'AT_RISK',
    isCriticalPath: false,
    blockedSince: null,
    neededBy: '2026-11-01',
  },
];

export const DECISION_LOG: DecisionPage = {
  items: [
    {
      id: id(701),
      reference: 'GOV-0012',
      title: 'Re-prioritise data engineering to DIG-011',
      context: null,
      kind: 'DECISION',
      initiative: null,
      requiredFrom: 'CEO',
      decisionOwner: null,
      dueDate: null,
      overdueDays: 0,
      outcome: 'APPROVED',
      outcomeNotes: 'actions assigned to Head, Technology',
      deferredUntil: null,
      decidedBy: null,
      decidedAt: '2026-10-09T10:00:00.000Z',
      changeRequestId: null,
      canDecide: false,
    },
    {
      id: id(702),
      reference: 'GOV-0010',
      title: 'Pause Branch Network Rationalisation',
      context: null,
      kind: 'DECISION',
      initiative: null,
      requiredFrom: 'CEO',
      decisionOwner: null,
      dueDate: null,
      overdueDays: 0,
      outcome: 'DEFERRED',
      outcomeNotes: 'revisit in November cycle',
      deferredUntil: '2026-11-05',
      decidedBy: null,
      decidedAt: '2026-09-25T10:00:00.000Z',
      changeRequestId: null,
      canDecide: false,
    },
  ],
  page: 1,
  pageSize: 5,
  total: 2,
};
