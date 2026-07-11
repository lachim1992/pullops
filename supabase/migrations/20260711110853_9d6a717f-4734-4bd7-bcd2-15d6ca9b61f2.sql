-- Pull day plans: blocks (dny/směny) that group cables with a spool capacity
CREATE TABLE public.pull_day_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  floor_plan_id UUID REFERENCES public.floor_plans(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  planned_date DATE,
  spool_count INTEGER NOT NULL DEFAULT 3,
  spool_length_m NUMERIC NOT NULL DEFAULT 305,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pull_day_plans_project_idx ON public.pull_day_plans(project_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pull_day_plans TO authenticated;
GRANT ALL ON public.pull_day_plans TO service_role;
ALTER TABLE public.pull_day_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY pull_day_plans_select ON public.pull_day_plans FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY pull_day_plans_insert ON public.pull_day_plans FOR INSERT TO authenticated
  WITH CHECK (
    public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  );
CREATE POLICY pull_day_plans_update ON public.pull_day_plans FOR UPDATE TO authenticated
  USING (
    public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  );
CREATE POLICY pull_day_plans_delete ON public.pull_day_plans FOR DELETE TO authenticated
  USING (
    public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  );

CREATE TRIGGER pull_day_plans_touch BEFORE UPDATE ON public.pull_day_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Validate tenant integrity: organization_id must match project.organization_id, floor_plan must belong to same project
CREATE OR REPLACE FUNCTION public.validate_pull_day_plan_tenant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID; v_fp_proj UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  IF NEW.floor_plan_id IS NOT NULL THEN
    SELECT project_id INTO v_fp_proj FROM public.floor_plans WHERE id = NEW.floor_plan_id;
    IF v_fp_proj IS NULL OR v_fp_proj <> NEW.project_id THEN RAISE EXCEPTION 'floor_plan does not belong to project'; END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER pull_day_plans_tenant BEFORE INSERT OR UPDATE ON public.pull_day_plans
  FOR EACH ROW EXECUTE FUNCTION public.validate_pull_day_plan_tenant();

-- Cable assignments to day plans (a cable can be in at most one plan)
CREATE TABLE public.pull_day_plan_cables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  day_plan_id UUID NOT NULL REFERENCES public.pull_day_plans(id) ON DELETE CASCADE,
  cable_id UUID NOT NULL REFERENCES public.cables(id) ON DELETE CASCADE UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pull_day_plan_cables_plan_idx ON public.pull_day_plan_cables(day_plan_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pull_day_plan_cables TO authenticated;
GRANT ALL ON public.pull_day_plan_cables TO service_role;
ALTER TABLE public.pull_day_plan_cables ENABLE ROW LEVEL SECURITY;

CREATE POLICY pull_day_plan_cables_select ON public.pull_day_plan_cables FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY pull_day_plan_cables_insert ON public.pull_day_plan_cables FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
      AND (public.has_project_role(auth.uid(), p.id, 'project_manager'::app_role)
           OR public.has_org_role(auth.uid(), p.organization_id, 'admin'::app_role)))
  );
CREATE POLICY pull_day_plan_cables_update ON public.pull_day_plan_cables FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
      AND (public.has_project_role(auth.uid(), p.id, 'project_manager'::app_role)
           OR public.has_org_role(auth.uid(), p.organization_id, 'admin'::app_role)))
  );
CREATE POLICY pull_day_plan_cables_delete ON public.pull_day_plan_cables FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
      AND (public.has_project_role(auth.uid(), p.id, 'project_manager'::app_role)
           OR public.has_org_role(auth.uid(), p.organization_id, 'admin'::app_role)))
  );

CREATE OR REPLACE FUNCTION public.validate_pull_day_plan_cable_tenant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan_proj UUID; v_cable_proj UUID;
BEGIN
  SELECT project_id INTO v_plan_proj FROM public.pull_day_plans WHERE id = NEW.day_plan_id;
  SELECT project_id INTO v_cable_proj FROM public.cables WHERE id = NEW.cable_id;
  IF v_plan_proj IS NULL OR v_cable_proj IS NULL THEN RAISE EXCEPTION 'plan or cable not found'; END IF;
  IF v_plan_proj <> NEW.project_id OR v_cable_proj <> NEW.project_id THEN
    RAISE EXCEPTION 'tenant mismatch'; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER pull_day_plan_cables_tenant BEFORE INSERT OR UPDATE ON public.pull_day_plan_cables
  FOR EACH ROW EXECUTE FUNCTION public.validate_pull_day_plan_cable_tenant();