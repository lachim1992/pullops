
-- 1) pull_day_plans: completion ready flag
ALTER TABLE public.pull_day_plans
  ADD COLUMN IF NOT EXISTS completion_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completion_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_ready_by uuid;

-- 2) endpoints: completion pipeline status
ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS completion_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS completion_updated_at timestamptz;

ALTER TABLE public.endpoints
  DROP CONSTRAINT IF EXISTS endpoints_completion_status_chk;
ALTER TABLE public.endpoints
  ADD CONSTRAINT endpoints_completion_status_chk
  CHECK (completion_status IN ('PENDING','PULLED','TERMINATED','TESTED','DONE'));

-- 3) patch_panels: completion pipeline status
ALTER TABLE public.patch_panels
  ADD COLUMN IF NOT EXISTS completion_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS completion_updated_at timestamptz;

ALTER TABLE public.patch_panels
  DROP CONSTRAINT IF EXISTS patch_panels_completion_status_chk;
ALTER TABLE public.patch_panels
  ADD CONSTRAINT patch_panels_completion_status_chk
  CHECK (completion_status IN ('PENDING','WIRED','LABELED','MEASURED','DONE'));

-- 4) RPC: mark plan ready for completion (PM/installer/admin on project)
CREATE OR REPLACE FUNCTION public.mark_plan_ready_for_completion_tx(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT project_id INTO v_proj FROM public.pull_day_plans WHERE id = p_plan_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'plan not found'; END IF;
  IF NOT (
    public.has_project_role(v_user, v_proj, 'project_manager')
    OR public.has_project_role(v_user, v_proj, 'installer')
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
$fn$;

-- 5) RPC: unmark (undo)
CREATE OR REPLACE FUNCTION public.unmark_plan_ready_for_completion_tx(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT project_id INTO v_proj FROM public.pull_day_plans WHERE id = p_plan_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'plan not found'; END IF;
  IF NOT (
    public.has_project_role(v_user, v_proj, 'project_manager')
    OR public.is_org_admin_for_project(v_user, v_proj)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.pull_day_plans
    SET completion_ready = false,
        completion_ready_at = NULL,
        completion_ready_by = NULL
    WHERE id = p_plan_id;
END;
$fn$;

-- 6) RPC: set patch panel completion status (installer/PM/admin)
CREATE OR REPLACE FUNCTION public.set_patch_panel_completion_status_tx(p_panel_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    public.has_project_role(v_user, v_proj, 'project_manager')
    OR public.has_project_role(v_user, v_proj, 'installer')
    OR public.is_org_admin_for_project(v_user, v_proj)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.patch_panels
    SET completion_status = p_status,
        completion_updated_at = now()
    WHERE id = p_panel_id;
END;
$fn$;

-- 7) RPC: set endpoint completion status with cable aggregation guard
CREATE OR REPLACE FUNCTION public.set_endpoint_completion_status_tx(p_endpoint_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_status NOT IN ('PENDING','PULLED','TERMINATED','TESTED','DONE') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  SELECT project_id INTO v_proj FROM public.endpoints WHERE id = p_endpoint_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'endpoint not found'; END IF;
  IF NOT public.is_project_member(v_user, v_proj) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.endpoints
    SET completion_status = p_status,
        completion_updated_at = now()
    WHERE id = p_endpoint_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.mark_plan_ready_for_completion_tx(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unmark_plan_ready_for_completion_tx(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_patch_panel_completion_status_tx(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_endpoint_completion_status_tx(uuid, text) TO authenticated;
