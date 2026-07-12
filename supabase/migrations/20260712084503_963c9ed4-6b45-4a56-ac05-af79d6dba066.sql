
-- Tighten dispenser_slots writes
DROP POLICY IF EXISTS dispenser_slots_write ON public.dispenser_slots;
CREATE POLICY dispenser_slots_write ON public.dispenser_slots
  FOR ALL TO authenticated
  USING (
    public.has_project_role(auth.uid(), project_id, 'project_manager')
    OR public.has_org_role(auth.uid(), organization_id, 'admin')
  )
  WITH CHECK (
    public.has_project_role(auth.uid(), project_id, 'project_manager')
    OR public.has_org_role(auth.uid(), organization_id, 'admin')
  );

-- Tighten spools update
DROP POLICY IF EXISTS spools_update ON public.spools;
CREATE POLICY spools_update ON public.spools
  FOR UPDATE TO authenticated
  USING (
    public.has_project_role(auth.uid(), project_id, 'project_manager')
    OR public.has_org_role(auth.uid(), organization_id, 'admin')
  )
  WITH CHECK (
    public.has_project_role(auth.uid(), project_id, 'project_manager')
    OR public.has_org_role(auth.uid(), organization_id, 'admin')
  );

-- Also tighten spools_insert to match
DROP POLICY IF EXISTS spools_insert ON public.spools;
CREATE POLICY spools_insert ON public.spools
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_project_role(auth.uid(), project_id, 'project_manager')
    OR public.has_org_role(auth.uid(), organization_id, 'admin')
  );

-- Revoke EXECUTE on SECURITY DEFINER helpers/validators from anon and authenticated.
-- These are called from RLS policies and triggers (postgres role), not directly by users.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname NOT IN (
        -- Keep these callable by authenticated users (RPCs)
        'create_organization_tx',
        'create_project_tx',
        'update_project_tx',
        'add_org_member_by_email_tx',
        'add_project_member_tx',
        'remove_org_member_tx',
        'remove_project_member_tx',
        'set_org_role_tx',
        'set_project_role_tx'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- Ensure TX RPCs are executable by authenticated only (not anon)
REVOKE EXECUTE ON FUNCTION public.create_organization_tx(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_tx(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_project_tx(uuid, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_project_tx(uuid, text, text, text, text, text, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_project_tx(uuid, text, text, text, project_status, text, numeric, numeric, numeric, numeric, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_project_tx(uuid, text, text, text, project_status, text, numeric, numeric, numeric, numeric, boolean, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.add_org_member_by_email_tx(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_org_member_by_email_tx(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.add_project_member_tx(uuid, uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_project_member_tx(uuid, uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.remove_org_member_tx(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_org_member_tx(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.remove_project_member_tx(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_project_member_tx(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_org_role_tx(uuid, uuid, app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_org_role_tx(uuid, uuid, app_role, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_project_role_tx(uuid, uuid, app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_role_tx(uuid, uuid, app_role, boolean) TO authenticated;
