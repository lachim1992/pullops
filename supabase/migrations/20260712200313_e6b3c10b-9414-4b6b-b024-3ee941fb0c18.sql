
DROP POLICY IF EXISTS lobby_photos_storage_insert ON storage.objects;
CREATE POLICY lobby_photos_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-lobby-photos'
    AND owner = auth.uid()
    AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS day_plan_photos_update ON public.pull_day_plan_photos;
CREATE POLICY day_plan_photos_update ON public.pull_day_plan_photos
  FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id));

DROP POLICY IF EXISTS pull_day_plans_update ON public.pull_day_plans;
CREATE POLICY pull_day_plans_update ON public.pull_day_plans
  FOR UPDATE TO authenticated
  USING (
    public.has_project_role(auth.uid(), project_id, 'project_manager'::public.app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_project_role(auth.uid(), project_id, 'project_manager'::public.app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS scan_codes_update ON public.scan_codes;
CREATE POLICY scan_codes_update ON public.scan_codes
  FOR UPDATE TO authenticated
  USING (
    public.has_project_role(auth.uid(), project_id, 'project_manager'::public.app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  )
  WITH CHECK (
    public.has_project_role(auth.uid(), project_id, 'project_manager'::public.app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  );
