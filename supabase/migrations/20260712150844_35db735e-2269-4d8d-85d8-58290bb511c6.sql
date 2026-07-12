ALTER TABLE public.pull_day_plans
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PLANNED';

CREATE TABLE IF NOT EXISTS public.pull_day_plan_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day_plan_id uuid NOT NULL REFERENCES public.pull_day_plans(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pull_day_plan_photos TO authenticated;
GRANT ALL ON public.pull_day_plan_photos TO service_role;

ALTER TABLE public.pull_day_plan_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "day_plan_photos_select" ON public.pull_day_plan_photos;
CREATE POLICY "day_plan_photos_select" ON public.pull_day_plan_photos
  FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
DROP POLICY IF EXISTS "day_plan_photos_insert" ON public.pull_day_plan_photos;
CREATE POLICY "day_plan_photos_insert" ON public.pull_day_plan_photos
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id));
DROP POLICY IF EXISTS "day_plan_photos_update" ON public.pull_day_plan_photos;
CREATE POLICY "day_plan_photos_update" ON public.pull_day_plan_photos
  FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
DROP POLICY IF EXISTS "day_plan_photos_delete" ON public.pull_day_plan_photos;
CREATE POLICY "day_plan_photos_delete" ON public.pull_day_plan_photos
  FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));

CREATE OR REPLACE FUNCTION public.validate_pull_day_plan_photo_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_dp_proj uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  SELECT project_id INTO v_dp_proj FROM public.pull_day_plans WHERE id = NEW.day_plan_id;
  IF v_dp_proj IS NULL OR v_dp_proj <> NEW.project_id THEN
    RAISE EXCEPTION 'day_plan does not belong to project';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_pull_day_plan_photo_tenant ON public.pull_day_plan_photos;
CREATE TRIGGER trg_validate_pull_day_plan_photo_tenant
  BEFORE INSERT OR UPDATE ON public.pull_day_plan_photos
  FOR EACH ROW EXECUTE FUNCTION public.validate_pull_day_plan_photo_tenant();

DROP POLICY IF EXISTS "day_plan_photos_bucket_select" ON storage.objects;
CREATE POLICY "day_plan_photos_bucket_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pull-day-plan-photos'
    AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
DROP POLICY IF EXISTS "day_plan_photos_bucket_insert" ON storage.objects;
CREATE POLICY "day_plan_photos_bucket_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pull-day-plan-photos'
    AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );
DROP POLICY IF EXISTS "day_plan_photos_bucket_delete" ON storage.objects;
CREATE POLICY "day_plan_photos_bucket_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pull-day-plan-photos'
    AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );