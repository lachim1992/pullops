
-- RACKS
CREATE TABLE public.racks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_plan_id uuid NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text,
  x numeric NOT NULL DEFAULT 0.5,
  y numeric NOT NULL DEFAULT 0.5,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (project_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.racks TO authenticated;
GRANT ALL ON public.racks TO service_role;
ALTER TABLE public.racks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "racks: project members read" ON public.racks
  FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "racks: project members insert" ON public.racks
  FOR INSERT TO authenticated WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "racks: project members update" ON public.racks
  FOR UPDATE TO authenticated USING (public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "racks: project members delete" ON public.racks
  FOR DELETE TO authenticated USING (public.is_project_member(auth.uid(), project_id));

CREATE TRIGGER racks_touch_updated_at BEFORE UPDATE ON public.racks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tenant validation: floor_plan must belong to same project
CREATE OR REPLACE FUNCTION public.validate_rack_tenant() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_p uuid;
begin
  select project_id into v_p from public.floor_plans where id = new.floor_plan_id;
  if v_p is null or v_p <> new.project_id then raise exception 'floor_plan does not belong to project'; end if;
  return new;
end;$$;
CREATE TRIGGER racks_validate_tenant BEFORE INSERT OR UPDATE ON public.racks
  FOR EACH ROW EXECUTE FUNCTION public.validate_rack_tenant();

-- CABLE BUNDLES (main trunks)
CREATE TABLE public.cable_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  floor_plan_id uuid NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  code text NOT NULL,
  rack_id uuid REFERENCES public.racks(id) ON DELETE SET NULL,
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (project_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cable_bundles TO authenticated;
GRANT ALL ON public.cable_bundles TO service_role;
ALTER TABLE public.cable_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bundles: project members read" ON public.cable_bundles
  FOR SELECT TO authenticated USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "bundles: project members insert" ON public.cable_bundles
  FOR INSERT TO authenticated WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "bundles: project members update" ON public.cable_bundles
  FOR UPDATE TO authenticated USING (public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY "bundles: project members delete" ON public.cable_bundles
  FOR DELETE TO authenticated USING (public.is_project_member(auth.uid(), project_id));

CREATE TRIGGER bundles_touch_updated_at BEFORE UPDATE ON public.cable_bundles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.validate_bundle_tenant() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_p uuid; v_r uuid;
begin
  select project_id into v_p from public.floor_plans where id = new.floor_plan_id;
  if v_p is null or v_p <> new.project_id then raise exception 'floor_plan does not belong to project'; end if;
  if new.rack_id is not null then
    select project_id into v_r from public.racks where id = new.rack_id;
    if v_r is null or v_r <> new.project_id then raise exception 'rack does not belong to project'; end if;
  end if;
  return new;
end;$$;
CREATE TRIGGER bundles_validate_tenant BEFORE INSERT OR UPDATE ON public.cable_bundles
  FOR EACH ROW EXECUTE FUNCTION public.validate_bundle_tenant();

-- PATCH_PANELS.rack_id
ALTER TABLE public.patch_panels
  ADD COLUMN rack_id uuid REFERENCES public.racks(id) ON DELETE SET NULL;

-- CABLES.bundle_id + branch_points
ALTER TABLE public.cables
  ADD COLUMN bundle_id uuid REFERENCES public.cable_bundles(id) ON DELETE SET NULL,
  ADD COLUMN branch_points jsonb;
