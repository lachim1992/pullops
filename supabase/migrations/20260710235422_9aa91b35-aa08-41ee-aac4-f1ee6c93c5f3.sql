
ALTER TABLE public.cable_bundles ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS cable_bundles_primary_per_plan
  ON public.cable_bundles(floor_plan_id) WHERE is_primary;

ALTER TABLE public.cable_types ADD COLUMN IF NOT EXISTS meters_per_hour numeric;

CREATE TABLE IF NOT EXISTS public.pull_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cable_id uuid NOT NULL REFERENCES public.cables(id) ON DELETE CASCADE,
  spool_group text,
  order_index int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  started_at timestamptz,
  done_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pull_tasks TO authenticated;
GRANT ALL ON public.pull_tasks TO service_role;

ALTER TABLE public.pull_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pull_tasks project members select"
  ON public.pull_tasks FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "pull_tasks project members insert"
  ON public.pull_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "pull_tasks project members update"
  ON public.pull_tasks FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "pull_tasks project members delete"
  ON public.pull_tasks FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));

CREATE TRIGGER pull_tasks_touch_updated_at
  BEFORE UPDATE ON public.pull_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER pull_tasks_validate_tenant
  BEFORE INSERT OR UPDATE ON public.pull_tasks
  FOR EACH ROW EXECUTE FUNCTION public.validate_child_project_tenant();
