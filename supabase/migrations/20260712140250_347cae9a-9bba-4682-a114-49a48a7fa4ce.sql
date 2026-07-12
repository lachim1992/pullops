-- RLS helper functions must be executable by authenticated (and anon, for
-- consistency — they are SECURITY DEFINER and only check the caller's own
-- membership/roles). Without EXECUTE, every RLS policy referencing these
-- helpers evaluates to false for signed-in users, hiding their own data and
-- blocking inserts. This restores app functionality broken by a prior
-- over-broad REVOKE.

GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin_for_project(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.share_org(uuid, uuid) TO authenticated, anon;