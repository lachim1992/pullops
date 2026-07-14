
CREATE OR REPLACE FUNCTION public.mark_plan_ready_for_completion_tx(p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT project_id INTO v_proj FROM public.pull_day_plans WHERE id = p_plan_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'plan not found'; END IF;
  IF NOT (
    public.is_project_member(v_user, v_proj)
    OR public.is_org_admin_for_project(v_user, v_proj)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.pull_day_plans
    SET completion_ready = true,
        completion_ready_at = now(),
        completion_ready_by = v_user
    WHERE id = p_plan_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_patch_panel_completion_status_tx(p_panel_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_status NOT IN ('PENDING','WIRED','LABELED','MEASURED','DONE') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  SELECT project_id INTO v_proj FROM public.patch_panels WHERE id = p_panel_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'panel not found'; END IF;
  IF NOT (
    public.is_project_member(v_user, v_proj)
    OR public.is_org_admin_for_project(v_user, v_proj)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.patch_panels
    SET completion_status = p_status,
        completion_updated_at = now()
    WHERE id = p_panel_id;
END;
$function$;
