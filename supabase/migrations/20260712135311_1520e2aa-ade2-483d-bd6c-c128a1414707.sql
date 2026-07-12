-- Endpoint photos: tighten INSERT to verify endpoint belongs to project
DROP POLICY IF EXISTS "endpoint-photos upload project members" ON storage.objects;
CREATE POLICY "endpoint-photos upload project members"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'endpoint-photos'
  AND EXISTS (
    SELECT 1 FROM public.endpoints e
    WHERE e.id::text = split_part(storage.objects.name, '/', 2)
      AND e.project_id::text = split_part(storage.objects.name, '/', 1)
      AND public.is_project_member(auth.uid(), e.project_id)
  )
);

-- Endpoint photos: DELETE must verify via endpoint_photos row
DROP POLICY IF EXISTS "endpoint-photos delete project members" ON storage.objects;
CREATE POLICY "endpoint-photos delete project members"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'endpoint-photos'
  AND EXISTS (
    SELECT 1 FROM public.endpoint_photos ep
    WHERE ep.storage_path = storage.objects.name
      AND public.is_project_member(auth.uid(), ep.project_id)
  )
);

-- Lobby photos: SELECT must verify project membership via project_lobby_photos
DROP POLICY IF EXISTS "lobby_photos_storage_select" ON storage.objects;
CREATE POLICY "lobby_photos_storage_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-lobby-photos'
  AND EXISTS (
    SELECT 1 FROM public.project_lobby_photos p
    WHERE p.storage_path = storage.objects.name
      AND public.is_project_member(auth.uid(), p.project_id)
  )
);