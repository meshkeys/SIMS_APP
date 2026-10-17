-- =====================================================================
-- Invitation lookup by token, for the public "accept invitation" page.
--
-- The invitee has no session yet, so row-level security hides the row.
-- Like sims_auth_memberships(), this SECURITY DEFINER function is a narrow,
-- read-only exception: it finds ONE invitation by the SHA-256 hash of its
-- secret token and returns only what the accept page needs.
-- Timestamps are returned as timestamptz (stored values are UTC).
-- =====================================================================

CREATE FUNCTION sims_invitation_by_token_hash(p_token_hash text)
RETURNS TABLE (
  invitation_id       uuid,
  organisation_id     uuid,
  organisation_name   text,
  organisation_status "OrganisationStatus",
  email               text,
  roles               text[],
  job_title           text,
  department_id       uuid,
  invited_by_name     text,
  expires_at          timestamptz,
  accepted_at         timestamptz,
  revoked_at          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, o.id, o.name, o.status, i.email, i.roles::text[], i."jobTitle",
         i."departmentId", u.name,
         i."expiresAt"  AT TIME ZONE 'UTC',
         i."acceptedAt" AT TIME ZONE 'UTC',
         i."revokedAt"  AT TIME ZONE 'UTC'
  FROM "Invitation" i
  JOIN "Organisation" o ON o.id = i."organisationId"
  JOIN "Membership" m   ON m.id = i."invitedById"
  JOIN "User" u         ON u.id = m."userId"
  WHERE i."tokenHash" = p_token_hash;
$$;

REVOKE ALL ON FUNCTION sims_invitation_by_token_hash(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sims_app') THEN
    GRANT EXECUTE ON FUNCTION sims_invitation_by_token_hash(text) TO sims_app;
  END IF;
END;
$$;

-- Lists of pending invitations per organisation, newest first.
CREATE INDEX "Invitation_organisationId_createdAt_idx" ON "Invitation" ("organisationId", "createdAt" DESC);
