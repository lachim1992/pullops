
-- 1) endpoint_cable_groups
CREATE TABLE public.endpoint_cable_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  endpoint_id uuid NOT NULL REFERENCES public.endpoints(id) ON DELETE CASCADE,
  cable_id uuid NOT NULL REFERENCES public.cables(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(endpoint_id, cable_id),
  UNIQUE(cable_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_cable_groups TO authenticated;
GRANT ALL ON public.endpoint_cable_groups TO service_role;

ALTER TABLE public.endpoint_cable_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read groups" ON public.endpoint_cable_groups
  FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "members can insert groups" ON public.endpoint_cable_groups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "members can update groups" ON public.endpoint_cable_groups
  FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "members can delete groups" ON public.endpoint_cable_groups
  FOR DELETE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));

-- tenant validation trigger
CREATE OR REPLACE FUNCTION public.validate_endpoint_cable_group_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ep_proj uuid;
  v_c_proj uuid;
BEGIN
  SELECT project_id INTO v_ep_proj FROM public.endpoints WHERE id = NEW.endpoint_id;
  SELECT project_id INTO v_c_proj FROM public.cables WHERE id = NEW.cable_id;
  IF v_ep_proj IS NULL OR v_c_proj IS NULL THEN
    RAISE EXCEPTION 'endpoint or cable not found';
  END IF;
  IF v_ep_proj <> NEW.project_id OR v_c_proj <> NEW.project_id THEN
    RAISE EXCEPTION 'tenant mismatch: endpoint/cable project differs from group project';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_endpoint_cable_group_tenant
  BEFORE INSERT OR UPDATE ON public.endpoint_cable_groups
  FOR EACH ROW EXECUTE FUNCTION public.validate_endpoint_cable_group_tenant();

CREATE TRIGGER trg_touch_endpoint_cable_groups
  BEFORE UPDATE ON public.endpoint_cable_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_ecg_endpoint ON public.endpoint_cable_groups(endpoint_id);
CREATE INDEX idx_ecg_project ON public.endpoint_cable_groups(project_id);

-- 2) rack_endpoint_id on cable_routes
ALTER TABLE public.cable_routes
  ADD COLUMN rack_endpoint_id uuid REFERENCES public.endpoints(id) ON DELETE SET NULL;
