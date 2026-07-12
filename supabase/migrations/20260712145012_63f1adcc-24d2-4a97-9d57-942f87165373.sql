
CREATE POLICY "defect_photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'defect-photos' AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "defect_photos_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'defect-photos' AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "defect_photos_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'defect-photos' AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
CREATE POLICY "defect_photos_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'defect-photos' AND public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
