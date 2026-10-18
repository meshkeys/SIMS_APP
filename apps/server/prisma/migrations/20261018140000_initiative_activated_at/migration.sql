-- When an initiative first became ACTIVE: an update is owed for a reporting
-- period only if the initiative was active before that period's deadline.
-- Existing active initiatives are treated as active from their baseline start.

-- AlterTable
ALTER TABLE "Initiative" ADD COLUMN     "activatedAt" TIMESTAMP(3);


UPDATE "Initiative"
SET "activatedAt" = COALESCE("baselineStart"::timestamp, "createdAt")
WHERE status IN ('ACTIVE', 'ON_HOLD', 'CLOSED');
