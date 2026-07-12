
CREATE POLICY "lobby_photos_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-lobby-photos');
CREATE POLICY "lobby_photos_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-lobby-photos' AND owner = auth.uid());
CREATE POLICY "lobby_photos_storage_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-lobby-photos' AND owner = auth.uid());

REVOKE EXECUTE ON FUNCTION public.is_org_admin_for_project(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_org_admin_for_project(uuid, uuid) TO authenticated, service_role;
