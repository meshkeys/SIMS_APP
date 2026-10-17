-- =====================================================================
-- Tenant isolation, data integrity and privilege hardening.
--
-- Prisma does not model row-level security, CHECK constraints or grants,
-- and it ignores them when diffing, so they live in hand-written SQL here.
--
-- ADDING A NEW TENANT TABLE LATER? In its migration, call:
--     SELECT sims_enable_tenant_rls('"NewTable"');
-- The e2e suite fails if any table with an "organisationId" column is
-- missing row-level security.
-- =====================================================================

-- CreateIndex (generated from schema.prisma: one ACTIVE ruleset per organisation)
CREATE UNIQUE INDEX "Ruleset_one_active_per_org" ON "Ruleset"("organisationId") WHERE (status = 'ACTIVE');

-- ---------------------------------------------------------------------
-- 1. Row-level security
-- ---------------------------------------------------------------------

-- The organisation the current transaction acts for. The API sets it with
--   SELECT set_config('app.current_org', '<uuid>', true)
-- at the start of every transaction (true = local to that transaction, so
-- it is safe behind PgBouncer in transaction mode).
-- Unset or empty → NULL → every policy evaluates false → no rows. Fail closed.
CREATE FUNCTION sims_current_org() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
AS $$ SELECT NULLIF(current_setting('app.current_org', true), '')::uuid $$;

-- Enables and FORCES row-level security on a table with an "organisationId"
-- column, and adds the tenant_isolation policy. FORCE makes the policy apply
-- to the table owner too; only superusers and BYPASSRLS roles skip it.
CREATE FUNCTION sims_enable_tenant_rls(target regclass) RETURNS void
  LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s
       USING ("organisationId" = sims_current_org())
       WITH CHECK ("organisationId" = sims_current_org())',
    target
  );
END;
$$;

-- Every existing table that carries "organisationId".
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'organisationId'
      AND NOT a.attisdropped
  LOOP
    PERFORM sims_enable_tenant_rls(t.rel);
  END LOOP;
END;
$$;

-- The tenant table itself: an organisation can only see its own row.
-- Sign-up sets app.current_org to the new organisation's id before inserting.
ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organisation" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Organisation"
  USING (id = sims_current_org())
  WITH CHECK (id = sims_current_org());

-- Not tenant-scoped, by design: "User", "RefreshToken", "DeviceToken".
-- A person is global (one login, several organisations). These tables are
-- only reached through the auth module, never through tenant endpoints.

-- ---------------------------------------------------------------------
-- 2. Privileges for the runtime role
-- ---------------------------------------------------------------------
-- Role names are a deployment convention (see docker/postgres/init).
-- Guarded so the migration still applies where the role does not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sims_app') THEN
    -- Audit trail is append-only for the application.
    REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM sims_app;
    -- The app has no business touching migration history.
    REVOKE ALL ON "_prisma_migrations" FROM sims_app;
    -- Helper used by future migrations only.
    REVOKE ALL ON FUNCTION sims_enable_tenant_rls(regclass) FROM PUBLIC;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. Integrity rules the API must never be able to break
-- ---------------------------------------------------------------------

ALTER TABLE "Organisation"
  ADD CONSTRAINT "Organisation_fiscalYearStartMonth_check" CHECK ("fiscalYearStartMonth" BETWEEN 1 AND 12),
  ADD CONSTRAINT "Organisation_onboardingStep_check"       CHECK ("onboardingStep" BETWEEN 0 AND 5),
  ADD CONSTRAINT "Organisation_slug_format_check"          CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$');

ALTER TABLE "User"
  ADD CONSTRAINT "User_email_lowercase_check" CHECK (email = lower(email));

ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_seats_check" CHECK (seats >= 0);

ALTER TABLE "StrategicPlan"
  ADD CONSTRAINT "StrategicPlan_dates_check"   CHECK ("endDate" >= "startDate"),
  ADD CONSTRAINT "StrategicPlan_version_check" CHECK (version >= 1);

ALTER TABLE "FrameworkLevel"
  ADD CONSTRAINT "FrameworkLevel_depth_check" CHECK (depth BETWEEN 1 AND 10);

ALTER TABLE "StrategyElement"
  ADD CONSTRAINT "StrategyElement_not_own_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> id),
  ADD CONSTRAINT "StrategyElement_executionScore_check" CHECK ("executionScore" IS NULL OR "executionScore" BETWEEN 0 AND 100),
  ADD CONSTRAINT "StrategyElement_impactScore_check"    CHECK ("impactScore" IS NULL OR "impactScore" >= 0);

ALTER TABLE "Kpi"
  ADD CONSTRAINT "Kpi_range_check" CHECK ("rangeLow" IS NULL OR "rangeHigh" IS NULL OR "rangeHigh" >= "rangeLow");

ALTER TABLE "Initiative"
  ADD CONSTRAINT "Initiative_priority_check"         CHECK (priority BETWEEN 1 AND 5),
  ADD CONSTRAINT "Initiative_verifiedProgress_check" CHECK ("verifiedProgress" BETWEEN 0 AND 100),
  ADD CONSTRAINT "Initiative_plannedProgress_check"  CHECK ("plannedProgress" BETWEEN 0 AND 100),
  ADD CONSTRAINT "Initiative_impactScore_check"      CHECK ("impactScore" IS NULL OR "impactScore" >= 0),
  ADD CONSTRAINT "Initiative_baseline_dates_check"   CHECK ("baselineStart" IS NULL OR "baselineEnd" IS NULL OR "baselineEnd" >= "baselineStart"),
  ADD CONSTRAINT "Initiative_money_check"            CHECK (("baselineBudget" IS NULL OR "baselineBudget" >= 0) AND ("spentToDate" IS NULL OR "spentToDate" >= 0)),
  -- An override must always carry a reason, an author and an expiry.
  ADD CONSTRAINT "Initiative_override_complete_check" CHECK (
    "healthOverride" IS NULL
    OR ("overrideReason" IS NOT NULL AND length(trim("overrideReason")) > 0
        AND "overrideById" IS NOT NULL AND "overrideExpiresAt" IS NOT NULL)
  );

ALTER TABLE "InitiativeObjectiveLink"
  ADD CONSTRAINT "InitiativeObjectiveLink_weight_check" CHECK ("contributionWeight" > 0 AND "contributionWeight" <= 100);

ALTER TABLE "Milestone"
  ADD CONSTRAINT "Milestone_weight_check"             CHECK (weight BETWEEN 0 AND 100),
  ADD CONSTRAINT "Milestone_claimedCompletion_check"  CHECK ("claimedCompletion" BETWEEN 0 AND 100),
  ADD CONSTRAINT "Milestone_verifiedCompletion_check" CHECK ("verifiedCompletion" BETWEEN 0 AND 100),
  ADD CONSTRAINT "Milestone_planned_window_check"     CHECK ("baselineStartDate" IS NULL OR "baselineDate" >= "baselineStartDate");

ALTER TABLE "Dependency"
  ADD CONSTRAINT "Dependency_not_self_check" CHECK ("fromInitiativeId" <> "toInitiativeId");

ALTER TABLE "ProgressSnapshot"
  ADD CONSTRAINT "ProgressSnapshot_progress_check" CHECK ("plannedProgress" BETWEEN 0 AND 100 AND "verifiedProgress" BETWEEN 0 AND 100);

ALTER TABLE "RiskIssue"
  ADD CONSTRAINT "RiskIssue_likelihood_check" CHECK (likelihood IS NULL OR likelihood BETWEEN 1 AND 5),
  ADD CONSTRAINT "RiskIssue_impact_check"     CHECK (impact IS NULL OR impact BETWEEN 1 AND 5);

ALTER TABLE "Escalation"
  ADD CONSTRAINT "Escalation_level_check" CHECK (level BETWEEN 1 AND 4),
  ADD CONSTRAINT "Escalation_single_source_check" CHECK (num_nonnulls("riskIssueId", "dependencyId") <= 1);

ALTER TABLE "EscalationLevelChange"
  ADD CONSTRAINT "EscalationLevelChange_levels_check" CHECK ("toLevel" BETWEEN 1 AND 4 AND ("fromLevel" IS NULL OR "fromLevel" BETWEEN 1 AND 4));

ALTER TABLE "ReportingPeriod"
  ADD CONSTRAINT "ReportingPeriod_dates_check" CHECK ("endDate" >= "startDate");

ALTER TABLE "StatusUpdate"
  ADD CONSTRAINT "StatusUpdate_progress_check" CHECK (
    "claimedProgress" BETWEEN 0 AND 100
    AND ("verifiedProgress" IS NULL OR "verifiedProgress" BETWEEN 0 AND 100)
    AND ("plannedProgress" IS NULL OR "plannedProgress" BETWEEN 0 AND 100)
  );

ALTER TABLE "StatusUpdateLine"
  ADD CONSTRAINT "StatusUpdateLine_completion_check" CHECK (
    "previousVerified" BETWEEN 0 AND 100
    AND "claimedCompletion" BETWEEN 0 AND 100
    AND ("verifiedCompletion" IS NULL OR "verifiedCompletion" BETWEEN 0 AND 100)
  );

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_body_check" CHECK (length(trim(body)) > 0);

ALTER TABLE "Benefit"
  ADD CONSTRAINT "Benefit_expectedValue_check" CHECK ("expectedValue" >= 0);

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_sizeBytes_check" CHECK ("sizeBytes" >= 0);
