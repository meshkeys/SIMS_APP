-- =====================================================================
-- Configurable escalation ladder.
--
-- The number of levels, their names, deciders and timings now come from
-- each organisation's Ruleset (`escalation.levels`), validated by the API.
-- The database keeps only a sanity range matching MAX_ESCALATION_LEVELS.
-- =====================================================================

-- Level history records the level's name and the ruleset in force, so the
-- audit trail stays accurate after the ladder is renamed or resized.
-- (Table is empty at this point; no backfill needed.)
ALTER TABLE "EscalationLevelChange"
  ADD COLUMN "rulesetVersion" INTEGER,
  ADD COLUMN "toLevelName"    TEXT NOT NULL;

ALTER TABLE "EscalationLevelChange"
  ADD CONSTRAINT "EscalationLevelChange_toLevelName_check" CHECK (length(trim("toLevelName")) > 0);

-- Replace the fixed 1–4 range with 1–10.
ALTER TABLE "Escalation" DROP CONSTRAINT "Escalation_level_check";
ALTER TABLE "Escalation"
  ADD CONSTRAINT "Escalation_level_check" CHECK (level BETWEEN 1 AND 10);

ALTER TABLE "EscalationLevelChange" DROP CONSTRAINT "EscalationLevelChange_levels_check";
ALTER TABLE "EscalationLevelChange"
  ADD CONSTRAINT "EscalationLevelChange_levels_check" CHECK (
    "toLevel" BETWEEN 1 AND 10
    AND ("fromLevel" IS NULL OR "fromLevel" BETWEEN 1 AND 10)
  );
