// Generated from prisma/schema.prisma by apps/server/scripts/sync-contract-enums.mjs.
// Do not edit: change the schema and run `npm run db:generate`.

export const OrganisationSector = {
  PRIVATE: 'PRIVATE',
  PUBLIC: 'PUBLIC',
  NON_PROFIT: 'NON_PROFIT'
} as const

export type OrganisationSector = (typeof OrganisationSector)[keyof typeof OrganisationSector]


export const OrganisationStatus = {
  ONBOARDING: 'ONBOARDING',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED'
} as const

export type OrganisationStatus = (typeof OrganisationStatus)[keyof typeof OrganisationStatus]


export const SubscriptionPlan = {
  TRIAL: 'TRIAL',
  STARTER: 'STARTER',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE'
} as const

export type SubscriptionPlan = (typeof SubscriptionPlan)[keyof typeof SubscriptionPlan]


export const SubscriptionStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED'
} as const

export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus]


export const Role = {
  BOARD: 'BOARD',
  CEO: 'CEO',
  STRATEGY_OFFICE: 'STRATEGY_OFFICE',
  EXECUTIVE_SPONSOR: 'EXECUTIVE_SPONSOR',
  INITIATIVE_OWNER: 'INITIATIVE_OWNER',
  TASK_OWNER: 'TASK_OWNER',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  INTERNAL_AUDIT: 'INTERNAL_AUDIT'
} as const

export type Role = (typeof Role)[keyof typeof Role]


export const MembershipStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  DEACTIVATED: 'DEACTIVATED'
} as const

export type MembershipStatus = (typeof MembershipStatus)[keyof typeof MembershipStatus]


export const FrameworkTemplate = {
  STRATEGIC_PILLARS: 'STRATEGIC_PILLARS',
  BALANCED_SCORECARD: 'BALANCED_SCORECARD',
  OKR: 'OKR',
  PUBLIC_SECTOR_RESULTS: 'PUBLIC_SECTOR_RESULTS',
  CUSTOM: 'CUSTOM'
} as const

export type FrameworkTemplate = (typeof FrameworkTemplate)[keyof typeof FrameworkTemplate]


export const PlanStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  ARCHIVED: 'ARCHIVED'
} as const

export type PlanStatus = (typeof PlanStatus)[keyof typeof PlanStatus]


export const KpiDirection = {
  HIGHER_IS_BETTER: 'HIGHER_IS_BETTER',
  LOWER_IS_BETTER: 'LOWER_IS_BETTER',
  WITHIN_RANGE: 'WITHIN_RANGE'
} as const

export type KpiDirection = (typeof KpiDirection)[keyof typeof KpiDirection]


export const Frequency = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  HALF_YEARLY: 'HALF_YEARLY',
  ANNUALLY: 'ANNUALLY'
} as const

export type Frequency = (typeof Frequency)[keyof typeof Frequency]


export const InitiativeStatus = {
  DRAFT: 'DRAFT',
  PROPOSED: 'PROPOSED',
  APPROVED: 'APPROVED',
  ACTIVE: 'ACTIVE',
  ON_HOLD: 'ON_HOLD',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED'
} as const

export type InitiativeStatus = (typeof InitiativeStatus)[keyof typeof InitiativeStatus]


export const Health = {
  GREEN: 'GREEN',
  AMBER: 'AMBER',
  RED: 'RED',
  UNKNOWN: 'UNKNOWN'
} as const

export type Health = (typeof Health)[keyof typeof Health]


export const Trajectory = {
  ON_TRAJECTORY: 'ON_TRAJECTORY',
  SLIGHTLY_BEHIND: 'SLIGHTLY_BEHIND',
  OFF_TRAJECTORY: 'OFF_TRAJECTORY',
  NOT_MEASURABLE: 'NOT_MEASURABLE'
} as const

export type Trajectory = (typeof Trajectory)[keyof typeof Trajectory]


export const MilestoneStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETE: 'COMPLETE',
  CANCELLED: 'CANCELLED'
} as const

export type MilestoneStatus = (typeof MilestoneStatus)[keyof typeof MilestoneStatus]


export const TaskStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  DONE: 'DONE',
  BLOCKED: 'BLOCKED'
} as const

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]


export const RiskType = {
  RISK: 'RISK',
  ISSUE: 'ISSUE'
} as const

export type RiskType = (typeof RiskType)[keyof typeof RiskType]


export const Severity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
} as const

export type Severity = (typeof Severity)[keyof typeof Severity]


export const RiskStatus = {
  OPEN: 'OPEN',
  MITIGATED: 'MITIGATED',
  CLOSED: 'CLOSED'
} as const

export type RiskStatus = (typeof RiskStatus)[keyof typeof RiskStatus]


export const DependencyStatus = {
  ON_TRACK: 'ON_TRACK',
  AT_RISK: 'AT_RISK',
  BLOCKED: 'BLOCKED',
  RESOLVED: 'RESOLVED'
} as const

export type DependencyStatus = (typeof DependencyStatus)[keyof typeof DependencyStatus]


export const EscalationSource = {
  RISK_ISSUE: 'RISK_ISSUE',
  DEPENDENCY: 'DEPENDENCY',
  MISSED_UPDATE: 'MISSED_UPDATE',
  MISSING_KPI_ACTUALS: 'MISSING_KPI_ACTUALS',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  MANUAL: 'MANUAL'
} as const

export type EscalationSource = (typeof EscalationSource)[keyof typeof EscalationSource]


export const EscalationStatus = {
  OPEN: 'OPEN',
  RESOLVED: 'RESOLVED',
  WITHDRAWN: 'WITHDRAWN'
} as const

export type EscalationStatus = (typeof EscalationStatus)[keyof typeof EscalationStatus]


export const EscalationChangeReason = {
  RAISED: 'RAISED',
  AUTO_TIMEOUT: 'AUTO_TIMEOUT',
  CRITICAL_SEVERITY: 'CRITICAL_SEVERITY',
  MANUAL: 'MANUAL',
  DE_ESCALATED: 'DE_ESCALATED'
} as const

export type EscalationChangeReason = (typeof EscalationChangeReason)[keyof typeof EscalationChangeReason]


export const PeriodStatus = {
  OPEN: 'OPEN',
  OWNER_SUBMISSION: 'OWNER_SUBMISSION',
  STRATEGY_REVIEW: 'STRATEGY_REVIEW',
  SPONSOR_REVIEW: 'SPONSOR_REVIEW',
  LOCKED: 'LOCKED'
} as const

export type PeriodStatus = (typeof PeriodStatus)[keyof typeof PeriodStatus]


export const UpdateStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  CHALLENGED: 'CHALLENGED',
  REVIEWED: 'REVIEWED',
  APPROVED: 'APPROVED'
} as const

export type UpdateStatus = (typeof UpdateStatus)[keyof typeof UpdateStatus]


export const CommentKind = {
  COMMENT: 'COMMENT',
  CHALLENGE: 'CHALLENGE',
  RESPONSE: 'RESPONSE'
} as const

export type CommentKind = (typeof CommentKind)[keyof typeof CommentKind]


export const BenefitType = {
  FINANCIAL: 'FINANCIAL',
  NON_FINANCIAL: 'NON_FINANCIAL'
} as const

export type BenefitType = (typeof BenefitType)[keyof typeof BenefitType]


export const ApprovalType = {
  INITIATIVE_APPROVAL: 'INITIATIVE_APPROVAL',
  BASELINE_CHANGE: 'BASELINE_CHANGE',
  BUDGET_CHANGE: 'BUDGET_CHANGE',
  SCOPE_CHANGE: 'SCOPE_CHANGE',
  MILESTONE_COMPLETION: 'MILESTONE_COMPLETION',
  RULESET_CHANGE: 'RULESET_CHANGE',
  PLAN_APPROVAL: 'PLAN_APPROVAL',
  INITIATIVE_CLOSURE: 'INITIATIVE_CLOSURE'
} as const

export type ApprovalType = (typeof ApprovalType)[keyof typeof ApprovalType]


export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN'
} as const

export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus]


export const DecisionOutcome = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DEFERRED: 'DEFERRED'
} as const

export type DecisionOutcome = (typeof DecisionOutcome)[keyof typeof DecisionOutcome]


export const RulesetStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
  REJECTED: 'REJECTED'
} as const

export type RulesetStatus = (typeof RulesetStatus)[keyof typeof RulesetStatus]


export const ReportTemplate = {
  MONTHLY_MANAGEMENT: 'MONTHLY_MANAGEMENT',
  QUARTERLY_BOARD: 'QUARTERLY_BOARD',
  PILLAR_DEEP_DIVE: 'PILLAR_DEEP_DIVE'
} as const

export type ReportTemplate = (typeof ReportTemplate)[keyof typeof ReportTemplate]


export const ReportFormat = {
  PDF: 'PDF',
  PPTX: 'PPTX',
  XLSX: 'XLSX'
} as const

export type ReportFormat = (typeof ReportFormat)[keyof typeof ReportFormat]


export const ReportPackStatus = {
  QUEUED: 'QUEUED',
  GENERATING: 'GENERATING',
  READY: 'READY',
  FAILED: 'FAILED'
} as const

export type ReportPackStatus = (typeof ReportPackStatus)[keyof typeof ReportPackStatus]


export const CustomFieldEntity = {
  STRATEGY_ELEMENT: 'STRATEGY_ELEMENT',
  KPI: 'KPI',
  INITIATIVE: 'INITIATIVE',
  MILESTONE: 'MILESTONE',
  RISK_ISSUE: 'RISK_ISSUE'
} as const

export type CustomFieldEntity = (typeof CustomFieldEntity)[keyof typeof CustomFieldEntity]


export const CustomFieldType = {
  TEXT: 'TEXT',
  NUMBER: 'NUMBER',
  CURRENCY: 'CURRENCY',
  DATE: 'DATE',
  SELECT: 'SELECT',
  MULTI_SELECT: 'MULTI_SELECT',
  BOOLEAN: 'BOOLEAN',
  USER: 'USER'
} as const

export type CustomFieldType = (typeof CustomFieldType)[keyof typeof CustomFieldType]
