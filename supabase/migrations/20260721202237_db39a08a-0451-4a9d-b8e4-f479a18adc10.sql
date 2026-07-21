
CREATE TABLE public.floor_plan_spools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  floor_plan_id uuid NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  spool_id uuid NOT NULL REFERENCES public.spools(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (floor_plan_id, spool_id)
);
CREATE INDEX floor_plan_spools_plan_idx ON public.floor_plan_spools(floor_plan_id);
CREATE INDEX floor_plan_spools_project_idx ON public.floor_plan_spools(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.floor_plan_spools TO authenticated;
GRANT ALL ON public.floor_plan_spools TO service_role;

ALTER TABLE public.floor_plan_spools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fps_select" ON public.floor_plan_spools FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));
CREATE POLICY "fps_insert" ON public.floor_plan_spools FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));
CREATE POLICY "fps_update" ON public.floor_plan_spools FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));
CREATE POLICY "fps_delete" ON public.floor_plan_spools FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE OR REPLACE FUNCTION public.validate_floor_plan_spool_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_plan_proj uuid; v_spool_proj uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  SELECT project_id INTO v_plan_proj FROM public.floor_plans WHERE id = NEW.floor_plan_id;
  IF v_plan_proj IS NULL OR v_plan_proj <> NEW.project_id THEN
    RAISE EXCEPTION 'floor_plan does not belong to project';
  END IF;
  SELECT project_id INTO v_spool_proj FROM public.spools WHERE id = NEW.spool_id;
  IF v_spool_proj IS NULL OR v_spool_proj <> NEW.project_id THEN
    RAISE EXCEPTION 'spool does not belong to project';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_floor_plan_spool_tenant
  BEFORE INSERT OR UPDATE ON public.floor_plan_spools
  FOR EACH ROW EXECUTE FUNCTION public.validate_floor_plan_spool_tenant();
