
-- 1) project_protocols
CREATE TABLE public.project_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reference_number TEXT NOT NULL,
  reference_seq INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location_note TEXT,
  floor_plan_id UUID REFERENCES public.floor_plans(id) ON DELETE SET NULL,
  participants TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  signed_by_name TEXT,
  signed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT project_protocols_status_ck CHECK (status IN ('DRAFT','FINALIZED')),
  CONSTRAINT project_protocols_ref_seq_uk UNIQUE (project_id, reference_seq)
);

CREATE INDEX project_protocols_project_idx ON public.project_protocols(project_id, created_at DESC);
CREATE INDEX project_protocols_org_idx ON public.project_protocols(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_protocols TO authenticated;
GRANT ALL ON public.project_protocols TO service_role;

ALTER TABLE public.project_protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "protocols_select_project_members"
  ON public.project_protocols FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "protocols_insert_project_members"
  ON public.project_protocols FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(auth.uid(), project_id)
    AND created_by = auth.uid()
  );

CREATE POLICY "protocols_update_author_or_pm"
  ON public.project_protocols FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_project_role(auth.uid(), project_id, 'project_manager')
    OR public.is_org_admin_for_project(auth.uid(), project_id)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.has_project_role(auth.uid(), project_id, 'project_manager')
    OR public.is_org_admin_for_project(auth.uid(), project_id)
  );

CREATE POLICY "protocols_delete_author_or_pm"
  ON public.project_protocols FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR public.has_project_role(auth.uid(), project_id, 'project_manager')
    OR public.is_org_admin_for_project(auth.uid(), project_id)
  );

-- Tenant/reference trigger
CREATE OR REPLACE FUNCTION public.validate_project_protocol_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_fp_proj UUID;
  v_seq INTEGER;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  IF NEW.floor_plan_id IS NOT NULL THEN
    SELECT project_id INTO v_fp_proj FROM public.floor_plans WHERE id = NEW.floor_plan_id;
    IF v_fp_proj IS NULL OR v_fp_proj <> NEW.project_id THEN
      RAISE EXCEPTION 'floor_plan does not belong to project';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(MAX(reference_seq), 0) + 1
      INTO v_seq
      FROM public.project_protocols
      WHERE project_id = NEW.project_id;
    NEW.reference_seq := v_seq;
    NEW.reference_number := 'P-' || LPAD(v_seq::text, 4, '0');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_project_protocols_tenant
  BEFORE INSERT OR UPDATE ON public.project_protocols
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_protocol_tenant();

CREATE TRIGGER trg_project_protocols_updated_at
  BEFORE UPDATE ON public.project_protocols
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) protocol_photos
CREATE TABLE public.protocol_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES public.project_protocols(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  caption TEXT,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX protocol_photos_protocol_idx ON public.protocol_photos(protocol_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.protocol_photos TO authenticated;
GRANT ALL ON public.protocol_photos TO service_role;

ALTER TABLE public.protocol_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "protocol_photos_select_project_members"
  ON public.protocol_photos FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "protocol_photos_insert_project_members"
  ON public.protocol_photos FOR INSERT TO authenticated
  WITH CHECK (
    public.is_project_member(auth.uid(), project_id)
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "protocol_photos_delete_uploader_or_pm"
  ON public.protocol_photos FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.has_project_role(auth.uid(), project_id, 'project_manager')
    OR public.is_org_admin_for_project(auth.uid(), project_id)
    OR EXISTS (
      SELECT 1 FROM public.project_protocols pp
      WHERE pp.id = protocol_photos.protocol_id AND pp.created_by = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.validate_protocol_photo_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_p_proj UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN
    NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT project_id INTO v_p_proj FROM public.project_protocols WHERE id = NEW.protocol_id;
  IF v_p_proj IS NULL OR v_p_proj <> NEW.project_id THEN
    RAISE EXCEPTION 'protocol does not belong to project';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protocol_photos_tenant
  BEFORE INSERT OR UPDATE ON public.protocol_photos
  FOR EACH ROW EXECUTE FUNCTION public.validate_protocol_photo_tenant();
