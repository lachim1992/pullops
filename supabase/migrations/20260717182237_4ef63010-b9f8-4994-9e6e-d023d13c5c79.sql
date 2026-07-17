-- 1) profiles: hide phone from other users by dropping table-level SELECT and re-granting only safe columns
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, avatar_url, default_organization_id, active, created_at, updated_at) ON public.profiles TO authenticated;

-- 2) endpoint-photos: add explicit fail-closed UPDATE policy (join to metadata table)
DROP POLICY IF EXISTS "endpoint-photos update project members" ON storage.objects;
CREATE POLICY "endpoint-photos update project members" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'endpoint-photos' AND EXISTS (
      SELECT 1 FROM public.endpoint_photos ep
      WHERE ep.storage_path = storage.objects.name
        AND public.is_project_member(auth.uid(), ep.project_id)
    )
  )
  WITH CHECK (
    bucket_id = 'endpoint-photos' AND EXISTS (
      SELECT 1 FROM public.endpoint_photos ep
      WHERE ep.storage_path = storage.objects.name
        AND public.is_project_member(auth.uid(), ep.project_id)
    )
  );

-- 3) lobby-photos: harden DELETE to require a matching metadata row (defense in depth)
DROP POLICY IF EXISTS lobby_photos_storage_delete ON storage.objects;
CREATE POLICY lobby_photos_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-lobby-photos'
    AND EXISTS (
      SELECT 1 FROM public.project_lobby_photos p
      WHERE p.storage_path = storage.objects.name
        AND public.is_project_member(auth.uid(), p.project_id)
        AND (storage.objects.owner = auth.uid()
             OR public.is_org_admin_for_project(auth.uid(), p.project_id))
    )
  );
