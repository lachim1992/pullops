-- 1) Data migration: normalize existing statuses to the new simplified model
-- Patch panels: MEASURED becomes WIRED
UPDATE public.patch_panels SET completion_status = 'WIRED' WHERE completion_status = 'MEASURED';

-- Endpoints: PULLED / DONE / TESTED collapse to TERMINATED
UPDATE public.endpoints SET completion_status = 'TERMINATED'
  WHERE completion_status IN ('PULLED','DONE','TESTED');

-- 2) Cables: add per-cable TESTED state (nullable timestamp + who)
ALTER TABLE public.cables
  ADD COLUMN IF NOT EXISTS tested_at timestamptz,
  ADD COLUMN IF NOT EXISTS tested_by uuid REFERENCES auth.users(id);

-- Cables that were previously in TESTED / DONE become TERMINATED + tested_at seeded
UPDATE public.cables
  SET tested_at = COALESCE(tested_at, now())
  WHERE status IN ('TESTED','DONE') AND tested_at IS NULL;
UPDATE public.cables
  SET status = 'TERMINATED'
  WHERE status IN ('TESTED','DONE');

-- 3) Derivation: is a cable terminated? (both ends satisfied)
CREATE OR REPLACE FUNCTION public.is_cable_terminated(p_cable_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH c AS (
    SELECT from_endpoint_id, to_endpoint_id, from_port_id, to_port_id
    FROM public.cables WHERE id = p_cable_id
  )
  SELECT
    (
      EXISTS (SELECT 1 FROM c JOIN public.endpoints e ON e.id = c.from_endpoint_id
              WHERE e.completion_status = 'TERMINATED')
      OR EXISTS (SELECT 1 FROM c JOIN public.patch_ports pp ON pp.id = c.from_port_id
                 JOIN public.patch_panels p ON p.id = pp.panel_id
                 WHERE p.completion_status = 'WIRED')
    )
    AND
    (
      EXISTS (SELECT 1 FROM c JOIN public.endpoints e ON e.id = c.to_endpoint_id
              WHERE e.completion_status = 'TERMINATED')
      OR EXISTS (SELECT 1 FROM c JOIN public.patch_ports pp ON pp.id = c.to_port_id
                 JOIN public.patch_panels p ON p.id = pp.panel_id
                 WHERE p.completion_status = 'WIRED')
    );
$$;

-- 4) Constrain endpoint status RPC to only manual values (PLANNED/TERMINATED/CANCELLED).
--    Trigger below cascades tested clearance on downgrade.
CREATE OR REPLACE FUNCTION public.set_endpoint_completion_status_tx(p_endpoint_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_status NOT IN ('PLANNED','TERMINATED','CANCELLED') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  SELECT project_id INTO v_proj FROM public.endpoints WHERE id = p_endpoint_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'endpoint not found'; END IF;
  IF NOT public.is_project_member(v_user, v_proj) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.endpoints SET completion_status = p_status, completion_updated_at = now() WHERE id = p_endpoint_id;
END;
$function$;

-- 5) Constrain patch-panel status RPC to only PLANNED / WIRED
CREATE OR REPLACE FUNCTION public.set_patch_panel_completion_status_tx(p_panel_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid(); v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_status NOT IN ('PLANNED','WIRED') THEN RAISE EXCEPTION 'invalid status'; END IF;
  SELECT project_id INTO v_proj FROM public.patch_panels WHERE id = p_panel_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'panel not found'; END IF;
  IF NOT (public.is_project_member(v_user, v_proj) OR public.is_org_admin_for_project(v_user, v_proj)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.patch_panels SET completion_status = p_status, completion_updated_at = now() WHERE id = p_panel_id;
END;
$function$;

-- 6) Setter for cable TESTED (requires terminated)
CREATE OR REPLACE FUNCTION public.set_cable_tested_tx(p_cable_id uuid, p_tested boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid(); v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT project_id INTO v_proj FROM public.cables WHERE id = p_cable_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'cable not found'; END IF;
  IF NOT public.is_project_member(v_user, v_proj) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_tested THEN
    IF NOT public.is_cable_terminated(p_cable_id) THEN
      RAISE EXCEPTION 'Kabel není zaterminovaný. Před proměřením musí být oba konce dokončené (endpoint TERMINATED nebo PP zapojený+popsaný).';
    END IF;
    UPDATE public.cables SET tested_at = now(), tested_by = v_user WHERE id = p_cable_id;
  ELSE
    UPDATE public.cables SET tested_at = NULL, tested_by = NULL WHERE id = p_cable_id;
  END IF;
END;
$$;

-- 7) Cascade: endpoint downgraded from TERMINATED -> clear tested on its cables
CREATE OR REPLACE FUNCTION public.on_endpoint_completion_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.completion_status = 'TERMINATED' AND NEW.completion_status IS DISTINCT FROM 'TERMINATED' THEN
    UPDATE public.cables
      SET tested_at = NULL, tested_by = NULL
      WHERE (from_endpoint_id = NEW.id OR to_endpoint_id = NEW.id)
        AND tested_at IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_endpoint_completion_cascade ON public.endpoints;
CREATE TRIGGER trg_endpoint_completion_cascade
  AFTER UPDATE OF completion_status ON public.endpoints
  FOR EACH ROW EXECUTE FUNCTION public.on_endpoint_completion_change();

-- 8) Cascade: PP downgraded from WIRED -> clear tested on cables with a port on that panel
CREATE OR REPLACE FUNCTION public.on_patch_panel_completion_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.completion_status = 'WIRED' AND NEW.completion_status IS DISTINCT FROM 'WIRED' THEN
    UPDATE public.cables c
      SET tested_at = NULL, tested_by = NULL
      FROM public.patch_ports pp
      WHERE pp.panel_id = NEW.id
        AND (c.from_port_id = pp.id OR c.to_port_id = pp.id)
        AND c.tested_at IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patch_panel_completion_cascade ON public.patch_panels;
CREATE TRIGGER trg_patch_panel_completion_cascade
  AFTER UPDATE OF completion_status ON public.patch_panels
  FOR EACH ROW EXECUTE FUNCTION public.on_patch_panel_completion_change();
