import type {
  DecisionOutcome,
  EscalationSource,
  Role,
  Severity,
} from '../../../src/generated/prisma/enums.js';
import type { PersonKey } from './people.js';

// ---------------------------------------------------------------------------
// Risks — 31 open, laid out to reproduce the portfolio heatmap
// ---------------------------------------------------------------------------

/** Heatmap cell counts: [impact][likelihood], both 1–5. */
export const RISK_HEATMAP: Record<number, Record<number, number>> = {
  5: { 2: 1, 3: 2, 4: 1, 5: 1 },
  4: { 2: 1, 3: 3, 4: 2, 5: 1 },
  3: { 1: 1, 2: 2, 3: 4, 4: 2 },
  2: { 1: 2, 2: 3, 3: 2, 4: 1 },
  1: { 1: 1, 2: 1 },
};

/** Likelihood × impact → severity. */
export { severityFor } from '../../../src/domain/governance/risks.js';

export interface RiskSpec {
  initiative: string | null;
  title: string;
  owner: PersonKey;
  likelihood: number;
  impact: number;
  mitigation?: string;
  dueDate?: string;
}

/** Named risks from the wireframes; the rest of the heatmap is filled from RISK_TITLES. */
export const NAMED_RISKS: RiskSpec[] = [
  {
    initiative: 'DIG-004',
    title: 'SEC product approval may slip past launch date',
    owner: 'headCompliance',
    likelihood: 3,
    impact: 4,
    dueDate: '2026-10-30',
    mitigation: 'Weekly regulator touchpoints; filing pack submitted early.',
  },
  {
    initiative: 'DIG-004',
    title: 'Low adoption among existing retail customers',
    owner: 'headMarketing',
    likelihood: 3,
    impact: 3,
    mitigation: 'Launch campaign and relationship-manager incentives in place.',
  },
];

export const RISK_TITLES = [
  'Key vendor may not meet delivery timeline',
  'Integration testing environment capacity is limited',
  'Budget overrun on third-party licences',
  'Regulatory change may alter product scope',
  'Scarce data engineering skills',
  'Customer data migration quality issues',
  'Change fatigue among branch staff',
  'Cyber security findings delay go-live',
  'Benefits may be overstated in business case',
  'Dependency on legacy core banking release',
  'Foreign exchange volatility affects vendor costs',
  'Partner bank may withdraw from agreement',
  'Insufficient user acceptance testing coverage',
  'Key person dependency on project manager',
  'Network outages in northern branches',
  'Delays in procurement approvals',
  'Low engagement with new performance framework',
  'Marketing budget reallocated mid-year',
  'Data privacy impact assessment incomplete',
  'Training rollout clashes with year-end',
  'Unclear ownership of operational handover',
  'Vendor financial stability concerns',
  'Union consultation may delay restructuring',
  'Kiosk hardware supply shortages',
  'Contact centre attrition above forecast',
  'API rate limits from payment partners',
  'Cloud cost growth above estimate',
  'Model risk in credit scoring algorithm',
  'Competitor launches similar product first',
];

// ---------------------------------------------------------------------------
// Issues (already happening — no likelihood)
// ---------------------------------------------------------------------------

export interface IssueSpec {
  key: string;
  initiative: string;
  title: string;
  owner: PersonKey;
  severity: Severity;
}

export const ISSUES: IssueSpec[] = [
  {
    key: 'apiNotReady-DIG-007',
    initiative: 'DIG-007',
    title: 'Core banking API not ready for integration testing',
    owner: 'headArch',
    severity: 'CRITICAL',
  },
  {
    key: 'apiNotReady-DIG-004',
    initiative: 'DIG-004',
    title: 'Core banking API not ready for integration testing',
    owner: 'headArch',
    severity: 'CRITICAL',
  },
  {
    key: 'vendorUnsigned',
    initiative: 'DIG-004',
    title: 'Vendor contract unsigned',
    owner: 'headDigital',
    severity: 'HIGH',
  },
  {
    key: 'dataTeam',
    initiative: 'DIG-011',
    title: 'Shared data engineering team over-allocated',
    owner: 'headTech',
    severity: 'HIGH',
  },
];

// ---------------------------------------------------------------------------
// Escalations — open: L1 9 · L2 5 · L3 2 · L4 0 (on the default 4-level ladder)
// ---------------------------------------------------------------------------

export interface EscalationSpec {
  initiative: string;
  title: string;
  source: EscalationSource;
  severity: Severity;
  /** Days since raised. */
  ageDays: number;
  /** Current level; history is generated from the ruleset's ladder timings. */
  level: number;
  issue?: string;
  risk?: string;
  resolved?: { afterDays: number; resolution: string };
}

export const ESCALATIONS: EscalationSpec[] = [
  {
    initiative: 'DIG-007',
    title: 'Core banking API dependency blocking onboarding go-live',
    source: 'RISK_ISSUE',
    issue: 'apiNotReady-DIG-007',
    severity: 'CRITICAL',
    ageDays: 21,
    level: 3,
  },
  {
    initiative: 'DIG-011',
    title: 'Shared data engineering team over-allocated',
    source: 'RESOURCE_CONFLICT',
    issue: 'dataTeam',
    severity: 'HIGH',
    ageDays: 16,
    level: 3,
  },
  {
    initiative: 'DIG-004',
    title: 'Vendor contract unsigned, Digital Investment Platform',
    source: 'RISK_ISSUE',
    issue: 'vendorUnsigned',
    severity: 'HIGH',
    ageDays: 9,
    level: 2,
  },
  {
    initiative: 'CX-001',
    title: 'No KPI actuals submitted for two periods',
    source: 'MISSING_KPI_ACTUALS',
    severity: 'MEDIUM',
    ageDays: 6,
    level: 1,
  },
  {
    initiative: 'DIG-004',
    title: 'SEC product approval may slip past launch',
    source: 'RISK_ISSUE',
    risk: 'SEC product approval may slip past launch date',
    severity: 'HIGH',
    ageDays: 4,
    level: 1,
  },
  {
    initiative: 'CX-004',
    title: 'October update not submitted',
    source: 'MISSED_UPDATE',
    severity: 'MEDIUM',
    ageDays: 3,
    level: 1,
  },
  {
    initiative: 'REV-006',
    title: 'Correspondent bank onboarding stalled',
    source: 'MANUAL',
    severity: 'HIGH',
    ageDays: 12,
    level: 2,
  },
  {
    initiative: 'CX-005',
    title: 'No KPI actuals submitted for journey metrics',
    source: 'MISSING_KPI_ACTUALS',
    severity: 'MEDIUM',
    ageDays: 10,
    level: 2,
  },
  {
    initiative: 'OPS-005',
    title: 'Union consultation on branch closures delayed',
    source: 'MANUAL',
    severity: 'MEDIUM',
    ageDays: 8,
    level: 2,
  },
  {
    initiative: 'DIG-009',
    title: 'Test environment unavailable for two weeks',
    source: 'MANUAL',
    severity: 'MEDIUM',
    ageDays: 5,
    level: 1,
  },
  {
    initiative: 'DIG-013',
    title: 'Hosting provider contract renewal pending',
    source: 'MANUAL',
    severity: 'MEDIUM',
    ageDays: 4,
    level: 1,
  },
  {
    initiative: 'REV-007',
    title: 'Treasury dealer hires awaiting approval',
    source: 'MANUAL',
    severity: 'LOW',
    ageDays: 2,
    level: 1,
  },
  {
    initiative: 'CX-002',
    title: 'Telephony vendor SLA breach',
    source: 'MANUAL',
    severity: 'MEDIUM',
    ageDays: 6,
    level: 1,
  },
  {
    initiative: 'PPL-002',
    title: 'Programme venue not secured for cohort 3',
    source: 'MANUAL',
    severity: 'LOW',
    ageDays: 1,
    level: 1,
  },
  {
    initiative: 'REV-004',
    title: 'SME pricing change awaiting sign-off',
    source: 'MANUAL',
    severity: 'LOW',
    ageDays: 3,
    level: 1,
  },
  {
    initiative: 'DIG-001',
    title: 'Data residency question from regulator',
    source: 'MANUAL',
    severity: 'MEDIUM',
    ageDays: 9,
    level: 2,
  },
  // Resolved — history only
  {
    initiative: 'OPS-003',
    title: 'Category spend data incomplete',
    source: 'MANUAL',
    severity: 'LOW',
    ageDays: 40,
    level: 1,
    resolved: { afterDays: 5, resolution: 'Finance supplied spend cube.' },
  },
  {
    initiative: 'PPL-001',
    title: 'Department heads missing scorecard workshops',
    source: 'MANUAL',
    severity: 'MEDIUM',
    ageDays: 50,
    level: 2,
    resolved: {
      afterDays: 10,
      resolution: 'CPO mandated attendance; sessions rescheduled.',
    },
  },
];

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export interface DecisionSpec {
  reference: string;
  initiative: string | null;
  title: string;
  context?: string;
  requiredFrom: Role;
  requiredFromPerson?: PersonKey;
  dueDate?: string;
  outcome: DecisionOutcome;
  outcomeNotes?: string;
  decidedBy?: PersonKey;
  decidedAt?: string;
  deferredUntil?: string;
  /** Creates a maker-checker change request linked to the decision. */
  changeRequest?: {
    type: 'BASELINE_CHANGE' | 'BUDGET_CHANGE';
    requestedBy: PersonKey;
    payload: Record<string, unknown>;
    justification: string;
  };
}

export const DECISIONS: DecisionSpec[] = [
  {
    reference: 'CR-0142',
    initiative: 'DIG-007',
    title: 'Approve 6-week baseline extension for Automate Customer Onboarding',
    requiredFrom: 'CEO',
    requiredFromPerson: 'ceo',
    dueDate: '2026-10-18',
    outcome: 'PENDING',
    changeRequest: {
      type: 'BASELINE_CHANGE',
      requestedBy: 'headTech',
      payload: {
        changes: { baselineEnd: '2026-11-26' },
        before: { baselineEnd: '2026-10-15' },
      },
      justification:
        'Core banking API dependency (DIG-011) slipped; integration cannot start before November.',
    },
  },
  {
    reference: 'CR-0139',
    initiative: 'DIG-004',
    title: 'Release contingency for Digital Investment Platform vendor',
    requiredFrom: 'EXECUTIVE_SPONSOR',
    requiredFromPerson: 'edBusiness',
    dueDate: '2026-10-20',
    outcome: 'PENDING',
    changeRequest: {
      type: 'BUDGET_CHANGE',
      requestedBy: 'headDigital',
      payload: {
        changes: { baselineBudget: 1_285_000_000 },
        before: { baselineBudget: 1_200_000_000 },
      },
      justification:
        'Vendor requires a mobilisation payment on signature (expected 22 Oct).',
    },
  },
  {
    reference: 'GOV-031',
    initiative: 'OPS-005',
    title: 'Assign an accountable owner to Branch Network Rationalisation',
    requiredFrom: 'STRATEGY_OFFICE',
    requiredFromPerson: 'strategyHead',
    dueDate: '2026-10-13',
    outcome: 'PENDING',
  },
  {
    reference: 'GOV-028',
    initiative: 'DIG-011',
    title: 'Re-prioritise data engineering to DIG-011',
    requiredFrom: 'CEO',
    outcome: 'APPROVED',
    decidedBy: 'ceo',
    decidedAt: '2026-10-09',
    outcomeNotes: 'EXCO approved; actions assigned to Head, Technology.',
  },
  {
    reference: 'GOV-027',
    initiative: 'PPL-001',
    title: 'Extend Performance Framework by 2 weeks',
    requiredFrom: 'CEO',
    outcome: 'REJECTED',
    decidedBy: 'ceo',
    decidedAt: '2026-10-02',
    outcomeNotes: 'Original baseline retained.',
  },
  {
    reference: 'GOV-025',
    initiative: 'OPS-005',
    title: 'Pause Branch Network Rationalisation',
    requiredFrom: 'CEO',
    outcome: 'DEFERRED',
    decidedBy: 'ceo',
    decidedAt: '2026-09-25',
    deferredUntil: '2026-11-15',
    outcomeNotes: 'Revisit in November cycle.',
  },
];

// ---------------------------------------------------------------------------
// Dependencies — "from depends on to"
// ---------------------------------------------------------------------------

export const DEPENDENCIES = [
  {
    from: 'DIG-007',
    to: 'DIG-011',
    status: 'BLOCKED',
    blockedSince: '2026-09-25',
    isCriticalPath: true,
    description: 'Onboarding needs the core banking API for account creation.',
  },
  {
    from: 'DIG-004',
    to: 'DIG-011',
    status: 'BLOCKED',
    blockedSince: '2026-10-02',
    isCriticalPath: true,
    description:
      'Investment platform needs the API layer for funding transfers.',
  },
  {
    from: 'REV-005',
    to: 'DIG-004',
    status: 'AT_RISK',
    neededBy: '2026-11-01',
    isCriticalPath: false,
    description: 'Bundle is sold through the investment platform.',
  },
] as const;
