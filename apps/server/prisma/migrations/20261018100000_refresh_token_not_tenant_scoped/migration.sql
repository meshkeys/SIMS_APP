-- =====================================================================
-- RefreshToken belongs to a person, not to a tenant.
--
-- Its "organisationId" column (the workspace a session is signed into) made
-- the tenant-RLS migration treat it as tenant data. Rename the column so the
-- schema-wide rule holds — "organisationId" always means tenant-owned and
-- RLS-protected — and remove the policy from this table.
-- =====================================================================

DROP POLICY tenant_isolation ON "RefreshToken";
ALTER TABLE "RefreshToken" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "RefreshToken" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "RefreshToken" RENAME COLUMN "organisationId" TO "activeOrganisationId";
