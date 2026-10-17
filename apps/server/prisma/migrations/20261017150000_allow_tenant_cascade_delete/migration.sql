-- =====================================================================
-- Lets an organisation (tenant) be deleted in one cascading statement.
--
-- Required relations defaulted to ON DELETE RESTRICT, which Postgres checks
-- immediately and which therefore blocks a cascade from "Organisation".
-- NO ACTION is checked at the end of the statement: deleting the whole
-- tenant succeeds, while deleting e.g. a reporting period that still has
-- updates, or a member who submitted updates, is still refused.
-- =====================================================================

-- DropForeignKey
ALTER TABLE "Approval" DROP CONSTRAINT "Approval_requestedById_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "BenefitActual" DROP CONSTRAINT "BenefitActual_periodId_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_authorId_fkey";

-- DropForeignKey
ALTER TABLE "Initiative" DROP CONSTRAINT "Initiative_planId_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_invitedById_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "KpiActual" DROP CONSTRAINT "KpiActual_periodId_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "ReportPack" DROP CONSTRAINT "ReportPack_periodId_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "ReportPack" DROP CONSTRAINT "ReportPack_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "ReportSnapshot" DROP CONSTRAINT "ReportSnapshot_periodId_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "StatusUpdate" DROP CONSTRAINT "StatusUpdate_periodId_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "StatusUpdate" DROP CONSTRAINT "StatusUpdate_submittedById_organisationId_fkey";

-- DropForeignKey
ALTER TABLE "StrategyElement" DROP CONSTRAINT "StrategyElement_levelId_organisationId_fkey";

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_organisationId_fkey" FOREIGN KEY ("invitedById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyElement" ADD CONSTRAINT "StrategyElement_levelId_organisationId_fkey" FOREIGN KEY ("levelId", "organisationId") REFERENCES "FrameworkLevel"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiActual" ADD CONSTRAINT "KpiActual_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Initiative" ADD CONSTRAINT "Initiative_planId_organisationId_fkey" FOREIGN KEY ("planId", "organisationId") REFERENCES "StrategicPlan"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusUpdate" ADD CONSTRAINT "StatusUpdate_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusUpdate" ADD CONSTRAINT "StatusUpdate_submittedById_organisationId_fkey" FOREIGN KEY ("submittedById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Membership"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSnapshot" ADD CONSTRAINT "ReportSnapshot_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPack" ADD CONSTRAINT "ReportPack_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPack" ADD CONSTRAINT "ReportPack_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "Membership"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenefitActual" ADD CONSTRAINT "BenefitActual_periodId_organisationId_fkey" FOREIGN KEY ("periodId", "organisationId") REFERENCES "ReportingPeriod"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_requestedById_organisationId_fkey" FOREIGN KEY ("requestedById", "organisationId") REFERENCES "Membership"("id", "organisationId") ON DELETE NO ACTION ON UPDATE CASCADE;

