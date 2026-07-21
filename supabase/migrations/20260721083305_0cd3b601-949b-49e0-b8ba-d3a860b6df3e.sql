CREATE TABLE public.plan_cable_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  day_plan_id uuid NOT NULL REFERENCES public.pull_day_plans(id) ON DELETE CASCADE,
  cable_id uuid NOT NULL REFERENCES public.cables(id) ON DELETE CASCADE,
  bundle_key text NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE(day_plan_id, cable_id)
);
CREATE INDEX plan_cable_bundles_plan_key_idx ON public.plan_cable_bundles(day_plan_id, bundle_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_cable_bundles TO authenticated;
GRANT ALL ON public.plan_cable_bundles TO service_role;

ALTER TABLE public.plan_cable_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plan_cable_bundles_select" ON public.plan_cable_bundles
  FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));
CREATE POLICY "plan_cable_bundles_insert" ON public.plan_cable_bundles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));
CREATE POLICY "plan_cable_bundles_update" ON public.plan_cable_bundles
  FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));
CREATE POLICY "plan_cable_bundles_delete" ON public.plan_cable_bundles
  FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.is_org_admin_for_project(auth.uid(), project_id));

CREATE OR REPLACE FUNCTION public.validate_plan_cable_bundle_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_plan_proj uuid; v_cable_proj uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  SELECT project_id INTO v_plan_proj FROM public.pull_day_plans WHERE id = NEW.day_plan_id;
  IF v_plan_proj IS NULL OR v_plan_proj <> NEW.project_id THEN RAISE EXCEPTION 'plan does not belong to project'; END IF;
  SELECT project_id INTO v_cable_proj FROM public.cables WHERE id = NEW.cable_id;
  IF v_cable_proj IS NULL OR v_cable_proj <> NEW.project_id THEN RAISE EXCEPTION 'cable does not belong to project'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER plan_cable_bundles_tenant_bi
  BEFORE INSERT OR UPDATE ON public.plan_cable_bundles
  FOR EACH ROW EXECUTE FUNCTION public.validate_plan_cable_bundle_tenant();