-- =====================================================================
-- Tightly scoped cross-tenant lookup for authentication.
--
-- At sign-in the API knows only the user, not the organisation, so row-level
-- security (correctly) hides every membership. This function returns ONLY
-- the given user's memberships and the minimum organisation fields needed
-- to choose a workspace. It is the single sanctioned way around RLS.
--
-- SECURITY DEFINER runs it with the owner's rights. The owner must be able
-- to bypass RLS (superuser or BYPASSRLS) — see README "Database roles".
-- =====================================================================

CREATE FUNCTION sims_auth_memberships(p_user_id uuid)
RETURNS TABLE (
  membership_id       uuid,
  organisation_id     uuid,
  organisation_slug   text,
  organisation_name   text,
  organisation_status "OrganisationStatus",
  roles               "Role"[],
  membership_status   "MembershipStatus"
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pin the search path so a caller cannot shadow tables or operators.
SET search_path = public, pg_temp
AS $$
  SELECT m.id, o.id, o.slug, o.name, o.status, m.roles, m.status
  FROM "Membership" m
  JOIN "Organisation" o ON o.id = m."organisationId"
  WHERE m."userId" = p_user_id
  ORDER BY m."joinedAt" NULLS LAST, m."createdAt";
$$;

REVOKE ALL ON FUNCTION sims_auth_memberships(uuid) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sims_app') THEN
    GRANT EXECUTE ON FUNCTION sims_auth_memberships(uuid) TO sims_app;
  END IF;
END;
$$;
