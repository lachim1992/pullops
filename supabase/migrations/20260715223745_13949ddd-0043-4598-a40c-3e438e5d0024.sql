
CREATE OR REPLACE FUNCTION public.delete_project_tx(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_org uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT organization_id INTO v_org FROM public.projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NOT public.has_org_role(v_user, v_org, 'admin') THEN
    RAISE EXCEPTION 'forbidden: requires org admin';
  END IF;

  DELETE FROM public.projects WHERE id = p_project_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.delete_project_tx(uuid) TO authenticated;
