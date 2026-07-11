
ALTER TABLE public.endpoints
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS customer_code text,
  ADD COLUMN IF NOT EXISTS room text,
  ADD COLUMN IF NOT EXISTS floor text,
  ADD COLUMN IF NOT EXISTS custom_attrs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reference_points jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.endpoint_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  caption text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_photos TO authenticated;
GRANT ALL ON public.endpoint_photos TO service_role;
ALTER TABLE public.endpoint_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos select project members" ON public.endpoint_photos FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "photos insert project members" ON public.endpoint_photos FOR INSERT TO authenticated WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "photos update project members" ON public.endpoint_photos FOR UPDATE TO authenticated USING (public.is_project_member(auth.uid(), project_id)) WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "photos delete project members" ON public.endpoint_photos FOR DELETE TO authenticated USING (public.is_project_member(auth.uid(), project_id));
CREATE TRIGGER trg_endpoint_photos_updated_at BEFORE UPDATE ON public.endpoint_photos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_endpoint_photos_endpoint ON public.endpoint_photos(endpoint_id);

CREATE TABLE IF NOT EXISTS public.endpoint_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id uuid NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_comments TO authenticated;
GRANT ALL ON public.endpoint_comments TO service_role;
ALTER TABLE public.endpoint_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments select project members" ON public.endpoint_comments FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "comments insert project members" ON public.endpoint_comments FOR INSERT TO authenticated WITH CHECK (public.is_project_member(auth.uid(), project_id) AND author_id = auth.uid());
CREATE POLICY "comments update project members" ON public.endpoint_comments FOR UPDATE TO authenticated USING (public.is_project_member(auth.uid(), project_id)) WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "comments delete author or admin" ON public.endpoint_comments FOR DELETE TO authenticated USING (
  author_id = auth.uid()
  OR public.has_project_role(auth.uid(), project_id, 'project_manager')
  OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = endpoint_comments.project_id AND public.has_org_role(auth.uid(), p.organization_id, 'admin'))
);
CREATE TRIGGER trg_endpoint_comments_updated_at BEFORE UPDATE ON public.endpoint_comments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_endpoint_comments_endpoint ON public.endpoint_comments(endpoint_id);

CREATE POLICY "endpoint-photos read project members" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'endpoint-photos'
  AND EXISTS (SELECT 1 FROM public.endpoint_photos ep WHERE ep.storage_path = storage.objects.name AND public.is_project_member(auth.uid(), ep.project_id))
);
CREATE POLICY "endpoint-photos upload project members" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'endpoint-photos'
  AND public.is_project_member(auth.uid(), (split_part(name, '/', 1))::uuid)
);
CREATE POLICY "endpoint-photos delete project members" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'endpoint-photos'
  AND public.is_project_member(auth.uid(), (split_part(name, '/', 1))::uuid)
);
