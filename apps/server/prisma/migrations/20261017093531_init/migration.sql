-- CreateEnum
CREATE TYPE "OrganisationSector" AS ENUM ('PRIVATE', 'PUBLIC', 'NON_PROFIT');

-- CreateEnum
CREATE TYPE "OrganisationStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('TRIAL', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BOARD', 'CEO', 'STRATEGY_OFFICE', 'EXECUTIVE_SPONSOR', 'INITIATIVE_OWNER', 'TASK_OWNER', 'SYSTEM_ADMIN', 'INTERNAL_AUDIT');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "FrameworkTemplate" AS ENUM ('STRATEGIC_PILLARS', 'BALANCED_SCORECARD', 'OKR', 'PUBLIC_SECTOR_RESULTS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KpiDirection" AS ENUM ('HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'WITHIN_RANGE');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "InitiativeStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Health" AS ENUM ('GREEN', 'AMBER', 'RED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Trajectory" AS ENUM ('ON_TRAJECTORY', 'SLIGHTLY_BEHIND', 'OFF_TRAJECTORY', 'NOT_MEASURABLE');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RiskType" AS ENUM ('RISK', 'ISSUE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MITIGATED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DependencyStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BLOCKED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "EscalationSource" AS ENUM ('RISK_ISSUE', 'DEPENDENCY', 'MISSED_UPDATE', 'MISSING_KPI_ACTUALS', 'RESOURCE_CONFLICT', 'MANUAL');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'RESOLVED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EscalationChangeReason" AS ENUM ('RAISED', 'AUTO_TIMEOUT', 'CRITICAL_SEVERITY', 'MANUAL', 'DE_ESCALATED');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'OWNER_SUBMISSION', 'STRATEGY_REVIEW', 'SPONSOR_REVIEW', 'LOCKED');

-- CreateEnum
CREATE TYPE "UpdateStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CHALLENGED', 'REVIEWED', 'APPROVED');

-- CreateEnum
CREATE TYPE "CommentKind" AS ENUM ('COMMENT', 'CHALLENGE', 'RESPONSE');

-- CreateEnum
CREATE TYPE "BenefitType" AS ENUM ('FINANCIAL', 'NON_FINANCIAL');

-- CreateEnum
CREATE TYPE "ApprovalType" AS ENUM ('INITIATIVE_APPROVAL', 'BASELINE_CHANGE', 'BUDGET_CHANGE', 'SCOPE_CHANGE', 'MILESTONE_COMPLETION', 'RULESET_CHANGE', 'PLAN_APPROVAL', 'INITIATIVE_CLOSURE');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "RulesetStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportTemplate" AS ENUM ('MONTHLY_MANAGEMENT', 'QUARTERLY_BOARD', 'PILLAR_DEEP_DIVE');

-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'PPTX', 'XLSX');

-- CreateEnum
CREATE TYPE "ReportPackStatus" AS ENUM ('QUEUED', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CustomFieldEntity" AS ENUM ('STRATEGY_ELEMENT', 'KPI', 'INITIATIVE', 'MILESTONE', 'RISK_ISSUE');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'USER');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sector" "OrganisationSector" NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Lagos',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "logoUrl" TEXT,
    "status" "OrganisationStatus" NOT NULL DEFAULT 'ONBOARDING',
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "terminology" JSONB NOT NULL DEFAULT '{"kpi":"KPI","initiative":"Initiative","milestone":"Milestone","task":"Task"}',
    "ssoConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'TRIAL',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "seats" INTEGER NOT NULL DEFAULT 10,
    "trialEndsAt" TIMESTAMP(3),
    "renewsAt" TIMESTAMP(3),
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phone" TEXT,
    "avatarUrl" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "organisationId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roles" "Role"[],
    "jobTitle" TEXT,
    "departmentId" UUID,
    "managerId" UUID,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "roles" "Role"[],
    "jobTitle" TEXT,
    "departmentId" UUID,
    "tokenHash" TEXT NOT NULL,
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategicPlan" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "template" "FrameworkTemplate" NOT NULL DEFAULT 'STRATEGIC_PILLARS',
    "vision" TEXT,
    "mission" TEXT,
    "values" TEXT[],
    "aspiration" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategicPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrameworkLevel" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "depth" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "pluralLabel" TEXT NOT NULL,
    "codePrefix" TEXT,
    "allowsKpis" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FrameworkLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyElement" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "levelId" UUID NOT NULL,
    "parentId" UUID,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" UUID,
    "sponsorId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "customFields" JSONB,
    "executionScore" DECIMAL(5,2),
    "impactScore" DECIMAL(5,2),
    "health" "Health" NOT NULL DEFAULT 'UNKNOWN',
    "rolledUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "entity" "CustomFieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kpi" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "elementId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "direction" "KpiDirection" NOT NULL DEFAULT 'HIGHER_IS_BETTER',
    "frequency" "Frequency" NOT NULL DEFAULT 'MONTHLY',
    "baseline" DECIMAL(20,4),
    "baselineDate" DATE,
    "target" DECIMAL(20,4),
    "rangeLow" DECIMAL(20,4),
    "rangeHigh" DECIMAL(20,4),
    "ownerId" UUID,
    "customFields" JSONB,
    "latestValue" DECIMAL(20,4),
    "latestAt" DATE,
    "trajectory" "Trajectory" NOT NULL DEFAULT 'NOT_MEASURABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiTarget" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "kpiId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "targetDate" DATE NOT NULL,
    "value" DECIMAL(20,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiActual" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "kpiId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "value" DECIMAL(20,4) NOT NULL,
    "commentary" TEXT,
    "submittedById" UUID,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Initiative" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "businessCase" TEXT,
    "scope" TEXT,
    "ownerId" UUID,
    "sponsorId" UUID,
    "benefitsOwnerId" UUID,
    "departmentId" UUID,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "status" "InitiativeStatus" NOT NULL DEFAULT 'DRAFT',
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "baselineStart" DATE,
    "baselineEnd" DATE,
    "baselineBudget" DECIMAL(20,2),
    "forecastEnd" DATE,
    "actualEnd" DATE,
    "spentToDate" DECIMAL(20,2),
    "calculatedHealth" "Health" NOT NULL DEFAULT 'UNKNOWN',
    "healthReasons" JSONB,
    "rulesetVersion" INTEGER,
    "healthOverride" "Health",
    "overrideReason" TEXT,
    "overrideById" UUID,
    "overrideAt" TIMESTAMP(3),
    "overrideExpiresAt" TIMESTAMP(3),
    "verifiedProgress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "plannedProgress" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "impactScore" DECIMAL(5,2),
    "impactSummary" TEXT,
    "trajectory" "Trajectory" NOT NULL DEFAULT 'NOT_MEASURABLE',
    "lastUpdateAt" TIMESTAMP(3),
    "lastVerifiedUpdateAt" TIMESTAMP(3),
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Initiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InitiativeObjectiveLink" (
    "organisationId" UUID NOT NULL,
    "initiativeId" UUID NOT NULL,
    "elementId" UUID NOT NULL,
    "contributionWeight" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "InitiativeObjectiveLink_pkey" PRIMARY KEY ("initiativeId","elementId")
);

-- CreateTable
CREATE TABLE "InitiativeKpiLink" (
    "organisationId" UUID NOT NULL,
    "initiativeId" UUID NOT NULL,
    "kpiId" UUID NOT NULL,
    "expectedImpact" DECIMAL(20,4),

    CONSTRAINT "InitiativeKpiLink_pkey" PRIMARY KEY ("initiativeId","kpiId")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "initiativeId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT true,
    "baselineStartDate" DATE,
    "baselineDate" DATE NOT NULL,
    "forecastDate" DATE,
    "actualDate" DATE,
    "claimedCompletion" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "verifiedCompletion" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "customFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "milestoneId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" UUID,
    "dueDate" DATE,
    "completedAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dependency" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "fromInitiativeId" UUID NOT NULL,
    "toInitiativeId" UUID NOT NULL,
    "description" TEXT,
    "isCriticalPath" BOOLEAN NOT NULL DEFAULT false,
    "status" "DependencyStatus" NOT NULL DEFAULT 'ON_TRACK',
    "blockedSince" TIMESTAMP(3),
    "neededBy" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressSnapshot" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "initiativeId" UUID NOT NULL,
    "periodId" UUID,
    "asOf" DATE NOT NULL,
    "plannedProgress" DECIMAL(5,2) NOT NULL,
    "verifiedProgress" DECIMAL(5,2) NOT NULL,
    "health" "Health" NOT NULL,
    "impactScore" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskIssue" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "initiativeId" UUID,
    "type" "RiskType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "likelihood" INTEGER,
    "impact" INTEGER,
    "severity" "Severity" NOT NULL,
    "ownerId" UUID,
    "mitigation" TEXT,
    "dueDate" DATE,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "source" "EscalationSource" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "Severity" NOT NULL,
    "initiativeId" UUID,
    "riskIssueId" UUID,
    "dependencyId" UUID,
    "level" INTEGER NOT NULL DEFAULT 1,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "raisedById" UUID,
    "decisionFromId" UUID,
    "decisionFromRole" "Role",
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "levelChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationLevelChange" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "escalationId" UUID NOT NULL,
    "fromLevel" INTEGER,
    "toLevel" INTEGER NOT NULL,
    "reason" "EscalationChangeReason" NOT NULL,
    "note" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EscalationLevelChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "initiativeId" UUID,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "context" TEXT,
    "requiredFrom" "Role" NOT NULL,
    "requiredFromId" UUID,
    "approvalId" UUID,
    "escalationId" UUID,
    "dueDate" DATE,
    "outcome" "DecisionOutcome" NOT NULL DEFAULT 'PENDING',
    "outcomeNotes" TEXT,
    "deferredUntil" DATE,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportingPeriod" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "submissionOpensAt" TIMESTAMP(3),
    "submissionDueAt" TIMESTAMP(3),
    "strategyReviewDueAt" TIMESTAMP(3),
    "sponsorReviewDueAt" TIMESTAMP(3),
    "reportIssueDueAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusUpdate" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "initiativeId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "submittedById" UUID NOT NULL,
    "claimedProgress" DECIMAL(5,2) NOT NULL,
    "verifiedProgress" DECIMAL(5,2),
    "plannedProgress" DECIMAL(5,2),
    "healthAtSubmission" "Health" NOT NULL,
    "progressNarrative" TEXT,
    "varianceExplanation" TEXT,
    "recoveryAction" TEXT,
    "nextSteps" TEXT,
    "needsDecision" BOOLEAN NOT NULL DEFAULT false,
    "status" "UpdateStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusUpdateLine" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "updateId" UUID NOT NULL,
    "milestoneId" UUID NOT NULL,
    "previousVerified" DECIMAL(5,2) NOT NULL,
    "claimedCompletion" DECIMAL(5,2) NOT NULL,
    "verifiedCompletion" DECIMAL(5,2),
    "forecastDate" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatusUpdateLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "parentId" UUID,
    "authorId" UUID NOT NULL,
    "kind" "CommentKind" NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportPack" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "snapshotId" UUID,
    "template" "ReportTemplate" NOT NULL,
    "title" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "scopeElementId" UUID,
    "sections" JSONB NOT NULL,
    "formats" "ReportFormat"[],
    "narrative" TEXT,
    "status" "ReportPackStatus" NOT NULL DEFAULT 'QUEUED',
    "version" TEXT NOT NULL DEFAULT '1.0',
    "fileKeys" JSONB,
    "error" TEXT,
    "requestedById" UUID NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benefit" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "initiativeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "BenefitType" NOT NULL,
    "unit" TEXT NOT NULL,
    "expectedValue" DECIMAL(20,2) NOT NULL,
    "expectedBy" DATE,
    "realisedToDate" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitProfile" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "benefitId" UUID NOT NULL,
    "periodEnd" DATE NOT NULL,
    "expectedValue" DECIMAL(20,2) NOT NULL,
    "forecastValue" DECIMAL(20,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenefitProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitActual" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "benefitId" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "realisedValue" DECIMAL(20,2) NOT NULL,
    "evidence" TEXT,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenefitActual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "reference" TEXT,
    "type" "ApprovalType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "justification" TEXT,
    "requestedById" UUID NOT NULL,
    "reviewerId" UUID,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decisionReason" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ruleset" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RulesetStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "changeSummary" TEXT,
    "proposedById" UUID,
    "approvedById" UUID,
    "effectiveFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ruleset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "uploadedById" UUID NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organisationId_key" ON "Subscription"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "Membership_organisationId_idx" ON "Membership"("organisationId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_organisationId_userId_key" ON "Membership"("organisationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_organisationId_key" ON "Membership"("id", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organisationId_email_idx" ON "Invitation"("organisationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE INDEX "Department_organisationId_idx" ON "Department"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_organisationId_name_key" ON "Department"("organisationId", "name");

-- CreateIndex
CREATE INDEX "StrategicPlan_organisationId_status_idx" ON "StrategicPlan"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StrategicPlan_id_organisationId_key" ON "StrategicPlan"("id", "organisationId");

-- CreateIndex
CREATE INDEX "FrameworkLevel_organisationId_idx" ON "FrameworkLevel"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkLevel_planId_depth_key" ON "FrameworkLevel"("planId", "depth");

-- CreateIndex
CREATE UNIQUE INDEX "FrameworkLevel_id_organisationId_key" ON "FrameworkLevel"("id", "organisationId");

-- CreateIndex
CREATE INDEX "StrategyElement_organisationId_idx" ON "StrategyElement"("organisationId");

-- CreateIndex
CREATE INDEX "StrategyElement_parentId_idx" ON "StrategyElement"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyElement_planId_code_key" ON "StrategyElement"("planId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyElement_id_organisationId_key" ON "StrategyElement"("id", "organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_organisationId_entity_key_key" ON "CustomFieldDefinition"("organisationId", "entity", "key");

-- CreateIndex
CREATE INDEX "Kpi_elementId_idx" ON "Kpi"("elementId");

-- CreateIndex
CREATE UNIQUE INDEX "Kpi_organisationId_code_key" ON "Kpi"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Kpi_id_organisationId_key" ON "Kpi"("id", "organisationId");

-- CreateIndex
CREATE INDEX "KpiTarget_organisationId_idx" ON "KpiTarget"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiTarget_kpiId_targetDate_key" ON "KpiTarget"("kpiId", "targetDate");

-- CreateIndex
CREATE INDEX "KpiActual_organisationId_periodId_idx" ON "KpiActual"("organisationId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiActual_kpiId_periodId_key" ON "KpiActual"("kpiId", "periodId");

-- CreateIndex
CREATE INDEX "Initiative_organisationId_status_calculatedHealth_idx" ON "Initiative"("organisationId", "status", "calculatedHealth");

-- CreateIndex
CREATE INDEX "Initiative_organisationId_ownerId_idx" ON "Initiative"("organisationId", "ownerId");

-- CreateIndex
CREATE INDEX "Initiative_organisationId_sponsorId_idx" ON "Initiative"("organisationId", "sponsorId");

-- CreateIndex
CREATE INDEX "Initiative_organisationId_departmentId_idx" ON "Initiative"("organisationId", "departmentId");

-- CreateIndex
CREATE INDEX "Initiative_planId_idx" ON "Initiative"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "Initiative_organisationId_code_key" ON "Initiative"("organisationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Initiative_id_organisationId_key" ON "Initiative"("id", "organisationId");

-- CreateIndex
CREATE INDEX "InitiativeObjectiveLink_elementId_idx" ON "InitiativeObjectiveLink"("elementId");

-- CreateIndex
CREATE INDEX "InitiativeObjectiveLink_organisationId_idx" ON "InitiativeObjectiveLink"("organisationId");

-- CreateIndex
CREATE INDEX "InitiativeKpiLink_kpiId_idx" ON "InitiativeKpiLink"("kpiId");

-- CreateIndex
CREATE INDEX "InitiativeKpiLink_organisationId_idx" ON "InitiativeKpiLink"("organisationId");

-- CreateIndex
CREATE INDEX "Milestone_initiativeId_idx" ON "Milestone"("initiativeId");

-- CreateIndex
CREATE INDEX "Milestone_organisationId_forecastDate_idx" ON "Milestone"("organisationId", "forecastDate");

-- CreateIndex
CREATE INDEX "Milestone_organisationId_baselineDate_idx" ON "Milestone"("organisationId", "baselineDate");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_id_organisationId_key" ON "Milestone"("id", "organisationId");

-- CreateIndex
CREATE INDEX "Task_milestoneId_idx" ON "Task"("milestoneId");

-- CreateIndex
CREATE INDEX "Task_organisationId_assigneeId_status_idx" ON "Task"("organisationId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "Dependency_toInitiativeId_idx" ON "Dependency"("toInitiativeId");

-- CreateIndex
CREATE INDEX "Dependency_organisationId_status_idx" ON "Dependency"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Dependency_fromInitiativeId_toInitiativeId_key" ON "Dependency"("fromInitiativeId", "toInitiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "Dependency_id_organisationId_key" ON "Dependency"("id", "organisationId");

-- CreateIndex
CREATE INDEX "ProgressSnapshot_organisationId_asOf_idx" ON "ProgressSnapshot"("organisationId", "asOf");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressSnapshot_initiativeId_asOf_key" ON "ProgressSnapshot"("initiativeId", "asOf");

-- CreateIndex
CREATE INDEX "RiskIssue_organisationId_status_severity_idx" ON "RiskIssue"("organisationId", "status", "severity");

-- CreateIndex
CREATE INDEX "RiskIssue_initiativeId_idx" ON "RiskIssue"("initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskIssue_id_organisationId_key" ON "RiskIssue"("id", "organisationId");

-- CreateIndex
CREATE INDEX "Escalation_organisationId_status_level_raisedAt_idx" ON "Escalation"("organisationId", "status", "level", "raisedAt");

-- CreateIndex
CREATE INDEX "Escalation_initiativeId_idx" ON "Escalation"("initiativeId");

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_organisationId_reference_key" ON "Escalation"("organisationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "Escalation_id_organisationId_key" ON "Escalation"("id", "organisationId");

-- CreateIndex
CREATE INDEX "EscalationLevelChange_escalationId_idx" ON "EscalationLevelChange"("escalationId");

-- CreateIndex
CREATE INDEX "EscalationLevelChange_organisationId_idx" ON "EscalationLevelChange"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_approvalId_key" ON "Decision"("approvalId");

-- CreateIndex
CREATE INDEX "Decision_organisationId_outcome_dueDate_idx" ON "Decision"("organisationId", "outcome", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Decision_organisationId_reference_key" ON "Decision"("organisationId", "reference");

-- CreateIndex
CREATE INDEX "ReportingPeriod_organisationId_status_idx" ON "ReportingPeriod"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingPeriod_planId_name_key" ON "ReportingPeriod"("planId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ReportingPeriod_id_organisationId_key" ON "ReportingPeriod"("id", "organisationId");

-- CreateIndex
CREATE INDEX "StatusUpdate_organisationId_periodId_status_idx" ON "StatusUpdate"("organisationId", "periodId", "status");

-- CreateIndex
CREATE INDEX "StatusUpdate_submittedById_idx" ON "StatusUpdate"("submittedById");

-- CreateIndex
CREATE UNIQUE INDEX "StatusUpdate_initiativeId_periodId_key" ON "StatusUpdate"("initiativeId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusUpdate_id_organisationId_key" ON "StatusUpdate"("id", "organisationId");

-- CreateIndex
CREATE INDEX "StatusUpdateLine_milestoneId_idx" ON "StatusUpdateLine"("milestoneId");

-- CreateIndex
CREATE INDEX "StatusUpdateLine_organisationId_idx" ON "StatusUpdateLine"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "StatusUpdateLine_updateId_milestoneId_key" ON "StatusUpdateLine"("updateId", "milestoneId");

-- CreateIndex
CREATE INDEX "Comment_organisationId_entityType_entityId_idx" ON "Comment"("organisationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ReportSnapshot_organisationId_periodId_idx" ON "ReportSnapshot"("organisationId", "periodId");

-- CreateIndex
CREATE INDEX "ReportPack_organisationId_createdAt_idx" ON "ReportPack"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "Benefit_initiativeId_idx" ON "Benefit"("initiativeId");

-- CreateIndex
CREATE INDEX "Benefit_organisationId_idx" ON "Benefit"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "Benefit_id_organisationId_key" ON "Benefit"("id", "organisationId");

-- CreateIndex
CREATE INDEX "BenefitProfile_organisationId_periodEnd_idx" ON "BenefitProfile"("organisationId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitProfile_benefitId_periodEnd_key" ON "BenefitProfile"("benefitId", "periodEnd");

-- CreateIndex
CREATE INDEX "BenefitActual_organisationId_periodId_idx" ON "BenefitActual"("organisationId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitActual_benefitId_periodId_key" ON "BenefitActual"("benefitId", "periodId");

-- CreateIndex
CREATE INDEX "Approval_organisationId_status_idx" ON "Approval"("organisationId", "status");

-- CreateIndex
CREATE INDEX "Approval_organisationId_entityType_entityId_idx" ON "Approval"("organisationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Ruleset_organisationId_status_idx" ON "Ruleset"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ruleset_organisationId_version_key" ON "Ruleset"("organisationId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_organisationId_entityType_entityId_idx" ON "Document"("organisationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Notification_organisationId_membershipId_readAt_createdAt_idx" ON "Notification"("organisationId", "membershipId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organisationId_createdAt_idx" ON "AuditEvent"("organisationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organisationId_entityType_entityId_idx" ON "AuditEvent"("organisationId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_organisationId_fkey" FOREIGN KEY ("invitedById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategicPlan" ADD CONSTRAINT "StrategicPlan_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategicPlan" ADD CONSTRAINT "StrategicPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameworkLevel" ADD CONSTRAINT "FrameworkLevel_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrameworkLevel" ADD CONSTRAINT "FrameworkLevel_planId_organisationId_fkey" FOREIGN KEY ("planId", "organisationId") REFERENCES "StrategicPlan"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyElement" ADD CONSTRAINT "StrategyElement_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyElement" ADD CONSTRAINT "StrategyElement_planId_organisationId_fkey" FOREIGN KEY ("planId", "organisationId") REFERENCES "StrategicPlan"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyElement" ADD CONSTRAINT "StrategyElement_levelId_organisationId_fkey" FOREIGN KEY ("levelId", "organisationId") REFERENCES "FrameworkLevel"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyElement" ADD CONSTRAINT "StrategyElement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StrategyElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyElement" ADD CONSTRAINT "StrategyElement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyElement" ADD CONSTRAINT "StrategyElement_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFieldDefinition" ADD CONSTRAINT "CustomFieldDefinition_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_elementId_organisationId_fkey" FOREIGN KEY ("elementId", "organisationId") REFERENCES "StrategyElement"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTarget" ADD CONSTRAINT "KpiTarget_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiTarget" ADD CONSTRAINT "KpiTarget_kpiId_organisationId_fkey" FOREIGN KEY ("kpiId", "organisationId") REFERENCES "Kpi"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiActual" ADD CONSTRAINT "KpiActual_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiActual" ADD CONSTRAINT "KpiActual_kpiId_organisationId_fkey" FOREIGN KEY ("kpiId", "organisationId") REFERENCES "Kpi"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiActual" ADD CONSTRAINT "KpiActual_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_planId_organisationId_fkey" FOREIGN KEY ("planId", "organisationId") REFERENCES "StrategicPlan"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_benefitsOwnerId_fkey" FOREIGN KEY ("benefitsOwnerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_overrideById_fkey" FOREIGN KEY ("overrideById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeObjectiveLink" ADD CONSTRAINT "InitiativeObjectiveLink_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeObjectiveLink" ADD CONSTRAINT "InitiativeObjectiveLink_initiativeId_organisationId_fkey" FOREIGN KEY ("initiativeId", "organisationId") REFERENCES "Initiative"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeObjectiveLink" ADD CONSTRAINT "InitiativeObjectiveLink_elementId_organisationId_fkey" FOREIGN KEY ("elementId", "organisationId") REFERENCES "StrategyElement"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeKpiLink" ADD CONSTRAINT "InitiativeKpiLink_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeKpiLink" ADD CONSTRAINT "InitiativeKpiLink_initiativeId_organisationId_fkey" FOREIGN KEY ("initiativeId", "organisationId") REFERENCES "Initiative"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeKpiLink" ADD CONSTRAINT "InitiativeKpiLink_kpiId_organisationId_fkey" FOREIGN KEY ("kpiId", "organisationId") REFERENCES "Kpi"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_initiativeId_organisationId_fkey" FOREIGN KEY ("initiativeId", "organisationId") REFERENCES "Initiative"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_milestoneId_organisationId_fkey" FOREIGN KEY ("milestoneId", "organisationId") REFERENCES "Milestone"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_fromInitiativeId_organisationId_fkey" FOREIGN KEY ("fromInitiativeId", "organisationId") REFERENCES "Initiative"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dependency" ADD CONSTRAINT "Dependency_toInitiativeId_organisationId_fkey" FOREIGN KEY ("toInitiativeId", "organisationId") REFERENCES "Initiative"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSnapshot" ADD CONSTRAINT "ProgressSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSnapshot" ADD CONSTRAINT "ProgressSnapshot_initiativeId_organisationId_fkey" FOREIGN KEY ("initiativeId", "organisationId") REFERENCES "Initiative"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressSnapshot" ADD CONSTRAINT "ProgressSnapshot_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ReportingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskIssue" ADD CONSTRAINT "RiskIssue_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskIssue" ADD CONSTRAINT "RiskIssue_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskIssue" ADD CONSTRAINT "RiskIssue_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_riskIssueId_fkey" FOREIGN KEY ("riskIssueId") REFERENCES "RiskIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_dependencyId_fkey" FOREIGN KEY ("dependencyId") REFERENCES "Dependency"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_decisionFromId_fkey" FOREIGN KEY ("decisionFromId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationLevelChange" ADD CONSTRAINT "EscalationLevelChange_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationLevelChange" ADD CONSTRAINT "EscalationLevelChange_escalationId_organisationId_fkey" FOREIGN KEY ("escalationId", "organisationId") REFERENCES "Escalation"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationLevelChange" ADD CONSTRAINT "EscalationLevelChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_requiredFromId_fkey" FOREIGN KEY ("requiredFromId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_escalationId_fkey" FOREIGN KEY ("escalationId") REFERENCES "Escalation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingPeriod" ADD CONSTRAINT "ReportingPeriod_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportingPeriod" ADD CONSTRAINT "ReportingPeriod_planId_organisationId_fkey" FOREIGN KEY ("planId", "organisationId") REFERENCES "StrategicPlan"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusUpdate" ADD CONSTRAINT "StatusUpdate_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusUpdate" ADD CONSTRAINT "StatusUpdate_initiativeId_organisationId_fkey" FOREIGN KEY ("initiativeId", "organisationId") REFERENCES "Initiative"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusUpdate" ADD CONSTRAINT "StatusUpdate_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusUpdate" ADD CONSTRAINT "StatusUpdate_submittedById_organisationId_fkey" FOREIGN KEY ("submittedById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusUpdateLine" ADD CONSTRAINT "StatusUpdateLine_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusUpdateLine" ADD CONSTRAINT "StatusUpdateLine_updateId_organisationId_fkey" FOREIGN KEY ("updateId", "organisationId") REFERENCES "StatusUpdate"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusUpdateLine" ADD CONSTRAINT "StatusUpdateLine_milestoneId_organisationId_fkey" FOREIGN KEY ("milestoneId", "organisationId") REFERENCES "Milestone"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPack" ADD CONSTRAINT "ReportPack_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPack" ADD CONSTRAINT "ReportPack_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPack" ADD CONSTRAINT "ReportPack_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ReportSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPack" ADD CONSTRAINT "ReportPack_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benefit" ADD CONSTRAINT "Benefit_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benefit" ADD CONSTRAINT "Benefit_initiativeId_organisationId_fkey" FOREIGN KEY ("initiativeId", "organisationId") REFERENCES "Initiative"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitProfile" ADD CONSTRAINT "BenefitProfile_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitProfile" ADD CONSTRAINT "BenefitProfile_benefitId_organisationId_fkey" FOREIGN KEY ("benefitId", "organisationId") REFERENCES "Benefit"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitActual" ADD CONSTRAINT "BenefitActual_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitActual" ADD CONSTRAINT "BenefitActual_benefitId_organisationId_fkey" FOREIGN KEY ("benefitId", "organisationId") REFERENCES "Benefit"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitActual" ADD CONSTRAINT "BenefitActual_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requestedById_organisationId_fkey" FOREIGN KEY ("requestedById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ruleset" ADD CONSTRAINT "Ruleset_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_membershipId_organisationId_fkey" FOREIGN KEY ("membershipId", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
