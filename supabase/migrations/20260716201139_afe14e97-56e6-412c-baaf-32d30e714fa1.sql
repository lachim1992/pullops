-- pull_rounds
CREATE TABLE public.pull_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day_plan_id uuid NOT NULL REFERENCES public.pull_day_plans(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  status text NOT NULL DEFAULT 'PLANNED',
  notes text,
  started_at timestamptz,
  started_by uuid REFERENCES auth.users(id),
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day_plan_id, round_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pull_rounds TO authenticated;
GRANT ALL ON public.pull_rounds TO service_role;

ALTER TABLE public.pull_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pull_rounds select project members"
  ON public.pull_rounds FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE POLICY "pull_rounds insert project members"
  ON public.pull_rounds FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE POLICY "pull_rounds update project members"
  ON public.pull_rounds FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE POLICY "pull_rounds delete project members"
  ON public.pull_rounds FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE TRIGGER trg_pull_rounds_updated_at BEFORE UPDATE ON public.pull_rounds
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- pull_round_items
CREATE TABLE public.pull_round_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.pull_rounds(id) ON DELETE CASCADE,
  cable_id uuid NOT NULL REFERENCES public.cables(id) ON DELETE CASCADE,
  spool_id uuid NOT NULL REFERENCES public.spools(id) ON DELETE RESTRICT,
  sequence integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING',
  planned_length_m numeric,
  actual_length_m numeric,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, cable_id),
  UNIQUE (round_id, spool_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pull_round_items TO authenticated;
GRANT ALL ON public.pull_round_items TO service_role;

ALTER TABLE public.pull_round_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pull_round_items select project members"
  ON public.pull_round_items FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE POLICY "pull_round_items insert project members"
  ON public.pull_round_items FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE POLICY "pull_round_items update project members"
  ON public.pull_round_items FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE POLICY "pull_round_items delete project members"
  ON public.pull_round_items FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE TRIGGER trg_pull_round_items_updated_at BEFORE UPDATE ON public.pull_round_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_pull_rounds_plan ON public.pull_rounds(day_plan_id);
CREATE INDEX idx_pull_round_items_round ON public.pull_round_items(round_id);

-- RPC: start_pull_round_tx
CREATE OR REPLACE FUNCTION public.start_pull_round_tx(
  p_day_plan_id uuid,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_proj uuid;
  v_org uuid;
  v_round_id uuid;
  v_round_no integer;
  v_item jsonb;
  v_seq integer := 0;
  v_cable_type uuid;
  v_spool_type uuid;
  v_cable_proj uuid;
  v_spool_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT project_id, organization_id INTO v_proj, v_org
    FROM public.pull_day_plans WHERE id = p_day_plan_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'plan not found'; END IF;
  IF NOT (public.is_project_member(v_user, v_proj)
          OR public.is_org_admin_for_project(v_user, v_proj)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- No other active round for this plan
  IF EXISTS (SELECT 1 FROM public.pull_rounds
             WHERE day_plan_id = p_day_plan_id AND status = 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Existuje již běžící kolo pro tento plán.';
  END IF;

  SELECT COALESCE(MAX(round_number), 0) + 1 INTO v_round_no
    FROM public.pull_rounds WHERE day_plan_id = p_day_plan_id;

  INSERT INTO public.pull_rounds(
    project_id, organization_id, day_plan_id, round_number,
    status, started_at, started_by, created_by
  ) VALUES (
    v_proj, v_org, p_day_plan_id, v_round_no,
    'IN_PROGRESS', now(), v_user, v_user
  ) RETURNING id INTO v_round_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_seq := v_seq + 1;
    -- Validate cable & spool tenants and type match
    SELECT project_id, cable_type_id INTO v_cable_proj, v_cable_type
      FROM public.cables WHERE id = (v_item->>'cableId')::uuid;
    SELECT project_id, cable_type_id INTO v_spool_proj, v_spool_type
      FROM public.spools WHERE id = (v_item->>'spoolId')::uuid;
    IF v_cable_proj IS NULL OR v_cable_proj <> v_proj THEN
      RAISE EXCEPTION 'Kabel nepatří do projektu.';
    END IF;
    IF v_spool_proj IS NULL OR v_spool_proj <> v_proj THEN
      RAISE EXCEPTION 'Cívka nepatří do projektu.';
    END IF;
    IF v_cable_type IS NOT NULL AND v_spool_type IS NOT NULL
       AND v_cable_type <> v_spool_type THEN
      RAISE EXCEPTION 'Typ kabelu a cívky se neshoduje.';
    END IF;
    -- Spool must be on this plan
    IF NOT EXISTS (SELECT 1 FROM public.pull_day_plan_spools
                   WHERE day_plan_id = p_day_plan_id
                     AND spool_id = (v_item->>'spoolId')::uuid) THEN
      RAISE EXCEPTION 'Cívka není přiřazená k plánu.';
    END IF;

    INSERT INTO public.pull_round_items(
      project_id, organization_id, round_id, cable_id, spool_id,
      sequence, status, planned_length_m
    ) VALUES (
      v_proj, v_org, v_round_id,
      (v_item->>'cableId')::uuid,
      (v_item->>'spoolId')::uuid,
      v_seq, 'PENDING',
      NULLIF(v_item->>'plannedLengthM','')::numeric
    );
  END LOOP;

  RETURN v_round_id;
END;
$$;

-- RPC: complete_pull_round_tx
CREATE OR REPLACE FUNCTION public.complete_pull_round_tx(
  p_round_id uuid,
  p_actuals jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Apply actuals
  IF p_actuals IS NOT NULL THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_actuals) LOOP
      UPDATE public.pull_round_items
        SET actual_length_m = NULLIF(v_row->>'actualLengthM','')::numeric,
            status = 'DONE',
            completed_at = COALESCE(completed_at, now())
        WHERE id = (v_row->>'itemId')::uuid AND round_id = p_round_id;
    END LOOP;
  END IF;

  -- Deduct from spools + mark cables PULLED
  FOR v_item IN SELECT * FROM public.pull_round_items WHERE round_id = p_round_id LOOP
    v_actual := COALESCE(v_item.actual_length_m, v_item.planned_length_m, 0);
    IF v_actual > 0 THEN
      UPDATE public.spools
        SET current_length_m = GREATEST(0, current_length_m - v_actual)
        WHERE id = v_item.spool_id;
    END IF;
    UPDATE public.cables SET status = 'PULLED' WHERE id = v_item.cable_id
      AND status IN ('PLANNED');
  END LOOP;

  UPDATE public.pull_rounds
    SET status = 'COMPLETED', completed_at = now(), completed_by = v_user
    WHERE id = p_round_id;
END;
$$;

-- RPC: cancel_pull_round_tx
CREATE OR REPLACE FUNCTION public.cancel_pull_round_tx(p_round_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_proj uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT project_id INTO v_proj FROM public.pull_rounds WHERE id = p_round_id;
  IF v_proj IS NULL THEN RAISE EXCEPTION 'round not found'; END IF;
  IF NOT (public.is_project_member(v_user, v_proj)
          OR public.is_org_admin_for_project(v_user, v_proj)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.pull_rounds
    SET status = 'CANCELLED', completed_at = now(), completed_by = v_user
    WHERE id = p_round_id;
END;
$$;