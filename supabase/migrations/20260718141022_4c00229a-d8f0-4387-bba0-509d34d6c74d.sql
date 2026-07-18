
ALTER TABLE public.cables ADD COLUMN IF NOT EXISTS pulled_at timestamptz;

UPDATE public.cables
  SET pulled_at = COALESCE(updated_at, created_at, now())
  WHERE status::text IN ('PULLED','TERMINATED','TESTED','DONE') AND pulled_at IS NULL;

CREATE OR REPLACE FUNCTION public.compute_cable_status(p_cable_id uuid)
RETURNS public.cable_status
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pulled_at timestamptz;
  v_tested_at timestamptz;
  v_current public.cable_status;
  v_terminated boolean;
BEGIN
  SELECT pulled_at, tested_at, status
    INTO v_pulled_at, v_tested_at, v_current
    FROM public.cables WHERE id = p_cable_id;
  IF v_current::text = 'CANCELLED' THEN RETURN v_current; END IF;
  v_terminated := public.is_cable_terminated(p_cable_id);
  IF v_terminated AND v_tested_at IS NOT NULL THEN RETURN 'DONE'::public.cable_status; END IF;
  IF v_terminated THEN RETURN 'TERMINATED'::public.cable_status; END IF;
  IF v_pulled_at IS NOT NULL THEN RETURN 'PULLED'::public.cable_status; END IF;
  RETURN 'PLANNED'::public.cable_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.recompute_cable_status_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'CANCELLED' THEN RETURN NEW; END IF;
  NEW.status := public.compute_cable_status(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cables_recompute_status ON public.cables;
CREATE TRIGGER trg_cables_recompute_status
BEFORE UPDATE OF pulled_at, tested_at, from_endpoint_id, to_endpoint_id, from_port_id, to_port_id
ON public.cables
FOR EACH ROW EXECUTE FUNCTION public.recompute_cable_status_trg();

CREATE OR REPLACE FUNCTION public.recompute_cables_for_endpoint()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cables
    SET status = public.compute_cable_status(id)
    WHERE (from_endpoint_id = NEW.id OR to_endpoint_id = NEW.id)
      AND status::text <> 'CANCELLED';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_endpoint_recompute_cables ON public.endpoints;
CREATE TRIGGER trg_endpoint_recompute_cables
AFTER UPDATE OF completion_status ON public.endpoints
FOR EACH ROW EXECUTE FUNCTION public.recompute_cables_for_endpoint();

CREATE OR REPLACE FUNCTION public.recompute_cables_for_panel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.cables c
    SET status = public.compute_cable_status(c.id)
    FROM public.patch_ports pp
    WHERE pp.panel_id = NEW.id
      AND (c.from_port_id = pp.id OR c.to_port_id = pp.id)
      AND c.status::text <> 'CANCELLED';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_panel_recompute_cables ON public.patch_panels;
CREATE TRIGGER trg_panel_recompute_cables
AFTER UPDATE OF completion_status ON public.patch_panels
FOR EACH ROW EXECUTE FUNCTION public.recompute_cables_for_panel();

UPDATE public.cables
  SET status = public.compute_cable_status(id)
  WHERE status::text <> 'CANCELLED';

CREATE OR REPLACE FUNCTION public.complete_pull_round_tx(p_round_id uuid, p_actuals jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_proj uuid;
  v_row jsonb;
  v_item public.pull_round_items%ROWTYPE;
  v_actual numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT project_id INTO v_proj FROM public.pull_rounds WHERE id = p_round_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'round not found'; END IF;
  IF NOT (public.is_project_member(v_user, v_proj)
          OR public.is_org_admin_for_project(v_user, v_proj)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_actuals IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_actuals) LOOP
      UPDATE public.pull_round_items
        SET actual_length_m = NULLIF(v_row->>'actualLengthM','')::numeric,
            status = 'DONE',
            completed_at = COALESCE(completed_at, now())
        WHERE id = (v_row->>'itemId')::uuid AND round_id = p_round_id;
    END LOOP;
  END IF;

  FOR v_item IN SELECT * FROM public.pull_round_items WHERE round_id = p_round_id LOOP
    v_actual := COALESCE(v_item.actual_length_m, v_item.planned_length_m, 0);
    IF v_actual > 0 THEN
      UPDATE public.spools
        SET current_length_m = GREATEST(0, current_length_m - v_actual)
        WHERE id = v_item.spool_id;
    END IF;
    UPDATE public.cables
      SET pulled_at = COALESCE(pulled_at, now())
      WHERE id = v_item.cable_id AND status::text IN ('PLANNED','PULLED');
  END LOOP;

  UPDATE public.pull_rounds
    SET status = 'COMPLETED', completed_at = now(), completed_by = v_user
    WHERE id = p_round_id;
END;
$function$;
