GRANT SELECT, INSERT, UPDATE, DELETE ON public.defect_photos TO authenticated;
GRANT ALL ON public.defect_photos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocol_photos TO authenticated;
GRANT ALL ON public.protocol_photos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_lobby_photos TO authenticated;
GRANT ALL ON public.project_lobby_photos TO service_role;

DROP POLICY IF EXISTS lobby_photos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS lobby_photos_storage_delete ON storage.objects;
DROP POLICY IF EXISTS protocol_photos_storage_select ON storage.objects;
DROP POLICY IF EXISTS protocol_photos_storage_insert ON storage.objects;
DROP POLICY IF EXISTS protocol_photos_storage_delete ON storage.objects;

CREATE POLICY lobby_photos_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'project-lobby-photos'
  AND owner = auth.uid()
  AND array_length(storage.foldername(name), 1) >= 2
  AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY lobby_photos_storage_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'project-lobby-photos'
  AND array_length(storage.foldername(name), 1) >= 2
  AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND (
    owner = auth.uid()
    OR public.is_org_admin_for_project(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

CREATE POLICY protocol_photos_storage_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'protocol-photos'
  AND array_length(storage.foldername(name), 1) >= 2
  AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY protocol_photos_storage_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'protocol-photos'
  AND array_length(storage.foldername(name), 1) >= 2
  AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY protocol_photos_storage_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'protocol-photos'
  AND array_length(storage.foldername(name), 1) >= 2
  AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);