
-- ============================================================
-- Checkpoint D: Scan codes, Physical spools, Visual Pull Station
-- ============================================================

-- ---------- Enums ----------
DO $$ BEGIN
  CREATE TYPE public.scan_entity_type AS ENUM ('SPOOL','ENDPOINT','DISPENSER_UNIT','DISPENSER_SLOT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.scan_code_kind AS ENUM ('QR','BARCODE','MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.spool_status AS ENUM ('WAREHOUSE','ON_STATION','EMPTY','ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.dispenser_slot_status AS ENUM ('EMPTY','LOADED','OUT_OF_SERVICE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.pull_assignment_status AS ENUM ('PLANNED','ACTIVE','PULLED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 1. scan_codes (unified QR/barcode registry)
-- ============================================================
CREATE TABLE public.scan_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type public.scan_entity_type NOT NULL,
  entity_id uuid NOT NULL,
  code text NOT NULL,
  code_kind public.scan_code_kind NOT NULL DEFAULT 'QR',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX scan_codes_project_code_uk ON public.scan_codes(project_id, code);
CREATE UNIQUE INDEX scan_codes_entity_uk ON public.scan_codes(project_id, entity_type, entity_id);
CREATE INDEX scan_codes_project_idx ON public.scan_codes(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_codes TO authenticated;
GRANT ALL ON public.scan_codes TO service_role;
ALTER TABLE public.scan_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY scan_codes_select ON public.scan_codes FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY scan_codes_insert ON public.scan_codes FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY scan_codes_update ON public.scan_codes FOR UPDATE TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));
CREATE POLICY scan_codes_delete ON public.scan_codes FOR DELETE TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE TRIGGER scan_codes_touch BEFORE UPDATE ON public.scan_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tenant integrity for scan_codes: organization_id must match project's org
CREATE OR REPLACE FUNCTION public.validate_scan_code_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER scan_codes_validate_tenant BEFORE INSERT OR UPDATE ON public.scan_codes
  FOR EACH ROW EXECUTE FUNCTION public.validate_scan_code_tenant();

-- ============================================================
-- 2. spools (physical spools)
-- ============================================================
CREATE TABLE public.spools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cable_type_id uuid REFERENCES public.cable_types(id) ON DELETE SET NULL,
  serial_no text NOT NULL,
  manufacturer text,
  batch_no text,
  initial_length_m numeric(10,2) NOT NULL,
  current_length_m numeric(10,2) NOT NULL,
  status public.spool_status NOT NULL DEFAULT 'WAREHOUSE',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (initial_length_m > 0),
  CHECK (current_length_m >= 0 AND current_length_m <= initial_length_m)
);
CREATE UNIQUE INDEX spools_project_serial_uk ON public.spools(project_id, serial_no);
CREATE INDEX spools_project_status_idx ON public.spools(project_id, status);
CREATE INDEX spools_project_type_idx ON public.spools(project_id, cable_type_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spools TO authenticated;
GRANT ALL ON public.spools TO service_role;
ALTER TABLE public.spools ENABLE ROW LEVEL SECURITY;

CREATE POLICY spools_select ON public.spools FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY spools_insert ON public.spools FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id));
CREATE POLICY spools_update ON public.spools FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY spools_delete ON public.spools FOR DELETE TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE TRIGGER spools_touch BEFORE UPDATE ON public.spools
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.validate_spool_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_ct_proj uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  IF NEW.cable_type_id IS NOT NULL THEN
    SELECT project_id INTO v_ct_proj FROM public.cable_types WHERE id = NEW.cable_type_id;
    IF v_ct_proj IS NULL OR v_ct_proj <> NEW.project_id THEN
      RAISE EXCEPTION 'cable_type does not belong to project';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER spools_validate_tenant BEFORE INSERT OR UPDATE ON public.spools
  FOR EACH ROW EXECUTE FUNCTION public.validate_spool_tenant();

-- ============================================================
-- 3. dispenser_templates
-- ============================================================
CREATE TABLE public.dispenser_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slot_count integer NOT NULL CHECK (slot_count > 0 AND slot_count <= 200),
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispenser_templates_project_idx ON public.dispenser_templates(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispenser_templates TO authenticated;
GRANT ALL ON public.dispenser_templates TO service_role;
ALTER TABLE public.dispenser_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY dispenser_templates_select ON public.dispenser_templates FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY dispenser_templates_write ON public.dispenser_templates FOR ALL TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE TRIGGER dispenser_templates_touch BEFORE UPDATE ON public.dispenser_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.validate_dispenser_template_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER dispenser_templates_validate_tenant BEFORE INSERT OR UPDATE ON public.dispenser_templates
  FOR EACH ROW EXECUTE FUNCTION public.validate_dispenser_template_tenant();

-- ============================================================
-- 4. pull_station_layouts
-- ============================================================
CREATE TABLE public.pull_station_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  floor_plan_id uuid REFERENCES public.floor_plans(id) ON DELETE SET NULL,
  name text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pull_station_layouts_project_idx ON public.pull_station_layouts(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pull_station_layouts TO authenticated;
GRANT ALL ON public.pull_station_layouts TO service_role;
ALTER TABLE public.pull_station_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY pull_station_layouts_select ON public.pull_station_layouts FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY pull_station_layouts_write ON public.pull_station_layouts FOR ALL TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE TRIGGER pull_station_layouts_touch BEFORE UPDATE ON public.pull_station_layouts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.validate_pull_station_layout_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_fp_proj uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  IF NEW.floor_plan_id IS NOT NULL THEN
    SELECT project_id INTO v_fp_proj FROM public.floor_plans WHERE id = NEW.floor_plan_id;
    IF v_fp_proj IS NULL OR v_fp_proj <> NEW.project_id THEN
      RAISE EXCEPTION 'floor_plan does not belong to project';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER pull_station_layouts_validate_tenant BEFORE INSERT OR UPDATE ON public.pull_station_layouts
  FOR EACH ROW EXECUTE FUNCTION public.validate_pull_station_layout_tenant();

-- ============================================================
-- 5. dispenser_units
-- ============================================================
CREATE TABLE public.dispenser_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  layout_id uuid NOT NULL REFERENCES public.pull_station_layouts(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.dispenser_templates(id) ON DELETE RESTRICT,
  position_index integer NOT NULL DEFAULT 0,
  label text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispenser_units_layout_idx ON public.dispenser_units(layout_id);
CREATE UNIQUE INDEX dispenser_units_layout_position_uk ON public.dispenser_units(layout_id, position_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispenser_units TO authenticated;
GRANT ALL ON public.dispenser_units TO service_role;
ALTER TABLE public.dispenser_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY dispenser_units_select ON public.dispenser_units FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY dispenser_units_write ON public.dispenser_units FOR ALL TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (public.has_project_role(auth.uid(), project_id, 'project_manager'::app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE TRIGGER dispenser_units_touch BEFORE UPDATE ON public.dispenser_units
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.validate_dispenser_unit_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_layout_proj uuid; v_tpl_proj uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  SELECT project_id INTO v_layout_proj FROM public.pull_station_layouts WHERE id = NEW.layout_id;
  IF v_layout_proj IS NULL OR v_layout_proj <> NEW.project_id THEN
    RAISE EXCEPTION 'layout does not belong to project';
  END IF;
  SELECT project_id INTO v_tpl_proj FROM public.dispenser_templates WHERE id = NEW.template_id;
  IF v_tpl_proj IS NULL OR v_tpl_proj <> NEW.project_id THEN
    RAISE EXCEPTION 'dispenser_template does not belong to project';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER dispenser_units_validate_tenant BEFORE INSERT OR UPDATE ON public.dispenser_units
  FOR EACH ROW EXECUTE FUNCTION public.validate_dispenser_unit_tenant();

-- ============================================================
-- 6. dispenser_slots
-- ============================================================
CREATE TABLE public.dispenser_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.dispenser_units(id) ON DELETE CASCADE,
  slot_index integer NOT NULL,
  current_spool_id uuid REFERENCES public.spools(id) ON DELETE SET NULL,
  status public.dispenser_slot_status NOT NULL DEFAULT 'EMPTY',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (slot_index >= 0)
);
CREATE UNIQUE INDEX dispenser_slots_unit_slot_uk ON public.dispenser_slots(unit_id, slot_index);
CREATE UNIQUE INDEX dispenser_slots_active_spool_uk ON public.dispenser_slots(current_spool_id)
  WHERE current_spool_id IS NOT NULL;
CREATE INDEX dispenser_slots_project_idx ON public.dispenser_slots(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispenser_slots TO authenticated;
GRANT ALL ON public.dispenser_slots TO service_role;
ALTER TABLE public.dispenser_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY dispenser_slots_select ON public.dispenser_slots FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY dispenser_slots_write ON public.dispenser_slots FOR ALL TO authenticated
  USING (public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id));

CREATE TRIGGER dispenser_slots_touch BEFORE UPDATE ON public.dispenser_slots
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.validate_dispenser_slot_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_unit_proj uuid; v_spool_proj uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  SELECT project_id INTO v_unit_proj FROM public.dispenser_units WHERE id = NEW.unit_id;
  IF v_unit_proj IS NULL OR v_unit_proj <> NEW.project_id THEN
    RAISE EXCEPTION 'dispenser_unit does not belong to project';
  END IF;
  IF NEW.current_spool_id IS NOT NULL THEN
    SELECT project_id INTO v_spool_proj FROM public.spools WHERE id = NEW.current_spool_id;
    IF v_spool_proj IS NULL OR v_spool_proj <> NEW.project_id THEN
      RAISE EXCEPTION 'spool does not belong to project';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER dispenser_slots_validate_tenant BEFORE INSERT OR UPDATE ON public.dispenser_slots
  FOR EACH ROW EXECUTE FUNCTION public.validate_dispenser_slot_tenant();

-- ============================================================
-- 7. pull_assignments (queue)
-- ============================================================
CREATE TABLE public.pull_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cable_id uuid NOT NULL REFERENCES public.cables(id) ON DELETE CASCADE,
  spool_id uuid REFERENCES public.spools(id) ON DELETE SET NULL,
  dispenser_slot_id uuid REFERENCES public.dispenser_slots(id) ON DELETE SET NULL,
  day_plan_id uuid REFERENCES public.pull_day_plans(id) ON DELETE SET NULL,
  status public.pull_assignment_status NOT NULL DEFAULT 'PLANNED',
  planned_meters numeric(10,2),
  actual_meters numeric(10,2),
  assigned_at timestamptz,
  pulled_at timestamptz,
  pulled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One active/planned assignment per cable at a time
CREATE UNIQUE INDEX pull_assignments_active_per_cable_uk
  ON public.pull_assignments(cable_id)
  WHERE status IN ('PLANNED','ACTIVE');
CREATE INDEX pull_assignments_project_status_idx ON public.pull_assignments(project_id, status);
CREATE INDEX pull_assignments_spool_idx ON public.pull_assignments(spool_id);
CREATE INDEX pull_assignments_slot_idx ON public.pull_assignments(dispenser_slot_id);
CREATE INDEX pull_assignments_day_plan_idx ON public.pull_assignments(day_plan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pull_assignments TO authenticated;
GRANT ALL ON public.pull_assignments TO service_role;
ALTER TABLE public.pull_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY pull_assignments_select ON public.pull_assignments FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));
CREATE POLICY pull_assignments_write ON public.pull_assignments FOR ALL TO authenticated
  USING (public.is_project_member(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id));

CREATE TRIGGER pull_assignments_touch BEFORE UPDATE ON public.pull_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.validate_pull_assignment_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_p uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = NEW.project_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  IF NEW.organization_id IS NULL THEN NEW.organization_id := v_org;
  ELSIF NEW.organization_id <> v_org THEN RAISE EXCEPTION 'tenant mismatch'; END IF;
  SELECT project_id INTO v_p FROM public.cables WHERE id = NEW.cable_id;
  IF v_p IS NULL OR v_p <> NEW.project_id THEN RAISE EXCEPTION 'cable does not belong to project'; END IF;
  IF NEW.spool_id IS NOT NULL THEN
    SELECT project_id INTO v_p FROM public.spools WHERE id = NEW.spool_id;
    IF v_p IS NULL OR v_p <> NEW.project_id THEN RAISE EXCEPTION 'spool does not belong to project'; END IF;
  END IF;
  IF NEW.dispenser_slot_id IS NOT NULL THEN
    SELECT project_id INTO v_p FROM public.dispenser_slots WHERE id = NEW.dispenser_slot_id;
    IF v_p IS NULL OR v_p <> NEW.project_id THEN RAISE EXCEPTION 'dispenser_slot does not belong to project'; END IF;
  END IF;
  IF NEW.day_plan_id IS NOT NULL THEN
    SELECT project_id INTO v_p FROM public.pull_day_plans WHERE id = NEW.day_plan_id;
    IF v_p IS NULL OR v_p <> NEW.project_id THEN RAISE EXCEPTION 'day_plan does not belong to project'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER pull_assignments_validate_tenant BEFORE INSERT OR UPDATE ON public.pull_assignments
  FOR EACH ROW EXECUTE FUNCTION public.validate_pull_assignment_tenant();
