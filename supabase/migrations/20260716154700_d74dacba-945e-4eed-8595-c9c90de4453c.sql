
ALTER TABLE public.endpoints DROP CONSTRAINT IF EXISTS endpoints_completion_status_chk;
ALTER TABLE public.patch_panels DROP CONSTRAINT IF EXISTS patch_panels_completion_status_chk;

UPDATE public.endpoints SET completion_status = 'PLANNED' WHERE completion_status = 'PENDING';
UPDATE public.patch_panels SET completion_status = CASE completion_status
  WHEN 'PENDING' THEN 'PLANNED'
  WHEN 'LABELED' THEN 'WIRED'
  WHEN 'DONE' THEN 'MEASURED'
  ELSE completion_status
END
WHERE completion_status IN ('PENDING','LABELED','DONE');

ALTER TABLE public.endpoints ALTER COLUMN completion_status SET DEFAULT 'PLANNED';
ALTER TABLE public.patch_panels ALTER COLUMN completion_status SET DEFAULT 'PLANNED';

ALTER TABLE public.endpoints ADD CONSTRAINT endpoints_completion_status_chk
  CHECK (completion_status = ANY (ARRAY['PLANNED'::text,'PULLED'::text,'TERMINATED'::text,'TESTED'::text,'DONE'::text,'CANCELLED'::text]));
ALTER TABLE public.patch_panels ADD CONSTRAINT patch_panels_completion_status_chk
  CHECK (completion_status = ANY (ARRAY['PLANNED'::text,'WIRED'::text,'MEASURED'::text]));

CREATE OR REPLACE FUNCTION public.set_endpoint_completion_status_tx(p_endpoint_id uuid, p_status text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_status NOT IN ('PLANNED','PULLED','TERMINATED','TESTED','DONE','CANCELLED') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  SELECT project_id INTO v_proj FROM public.endpoints WHERE id = p_endpoint_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'endpoint not found'; END IF;
  IF NOT public.is_project_member(v_user, v_proj) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.endpoints SET completion_status = p_status, completion_updated_at = now() WHERE id = p_endpoint_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_patch_panel_completion_status_tx(p_panel_id uuid, p_status text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_status NOT IN ('PLANNED','WIRED','MEASURED') THEN RAISE EXCEPTION 'invalid status'; END IF;
  SELECT project_id INTO v_proj FROM public.patch_panels WHERE id = p_panel_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'panel not found'; END IF;
  IF NOT (public.is_project_member(v_user, v_proj) OR public.is_org_admin_for_project(v_user, v_proj)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.patch_panels SET completion_status = p_status, completion_updated_at = now() WHERE id = p_panel_id;
END;
$function$;
