
-- 1. Table
CREATE TABLE public.endpoint_kinds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  default_reserve_m numeric NOT NULL DEFAULT 3 CHECK (default_reserve_m >= 0),
  color text,
  icon text,
  sort_order int NOT NULL DEFAULT 100,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

CREATE INDEX endpoint_kinds_project_id_idx ON public.endpoint_kinds(project_id);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.endpoint_kinds TO authenticated;
GRANT ALL ON public.endpoint_kinds TO service_role;

-- 3. RLS
ALTER TABLE public.endpoint_kinds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "endpoint_kinds_select_member"
  ON public.endpoint_kinds FOR SELECT TO authenticated
  USING (public.is_project_member(auth.uid(), project_id));

CREATE POLICY "endpoint_kinds_insert_admin_pm"
  ON public.endpoint_kinds FOR INSERT TO authenticated
  WITH CHECK (
    public.has_org_role(auth.uid(), organization_id, 'admin')
    OR public.has_project_role(auth.uid(), project_id, 'project_manager')
  );

CREATE POLICY "endpoint_kinds_update_admin_pm"
  ON public.endpoint_kinds FOR UPDATE TO authenticated
  USING (
    public.has_org_role(auth.uid(), organization_id, 'admin')
    OR public.has_project_role(auth.uid(), project_id, 'project_manager')
  )
  WITH CHECK (
    public.has_org_role(auth.uid(), organization_id, 'admin')
    OR public.has_project_role(auth.uid(), project_id, 'project_manager')
  );

CREATE POLICY "endpoint_kinds_delete_admin_pm"
  ON public.endpoint_kinds FOR DELETE TO authenticated
  USING (
    is_system = false
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin')
      OR public.has_project_role(auth.uid(), project_id, 'project_manager')
    )
  );

-- 4. updated_at trigger
CREATE TRIGGER trg_endpoint_kinds_updated_at
  BEFORE UPDATE ON public.endpoint_kinds
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. tenant validation
CREATE TRIGGER trg_endpoint_kinds_tenant
  BEFORE INSERT OR UPDATE ON public.endpoint_kinds
  FOR EACH ROW EXECUTE FUNCTION public.validate_child_project_tenant();

-- 6. Seed helper (idempotent)
CREATE OR REPLACE FUNCTION public.seed_endpoint_kinds(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.projects WHERE id = p_project_id;
  IF v_org IS NULL THEN RETURN; END IF;

  INSERT INTO public.endpoint_kinds (project_id, organization_id, code, label, default_reserve_m, color, icon, sort_order, is_system)
  VALUES
    (p_project_id, v_org, 'WORKSTATION',   'Pracoviště / PC',   3, 'hsl(210 80% 50%)',  'Monitor',   10, true),
    (p_project_id, v_org, 'MONITOR',       'Monitor',           3, 'hsl(200 70% 55%)',  'Monitor',   20, true),
    (p_project_id, v_org, 'AP',            'Wi-Fi AP',          2, 'hsl(160 60% 45%)',  'Wifi',      30, true),
    (p_project_id, v_org, 'CAMERA',        'Kamera',            2, 'hsl(15 80% 55%)',   'Cctv',      40, true),
    (p_project_id, v_org, 'SOCKET',        'Datová zásuvka',    3, 'hsl(260 55% 55%)',  'Plug',      50, true),
    (p_project_id, v_org, 'TRUNK_STRIP',   'Lišta',             3, 'hsl(280 50% 55%)',  'PanelTop',  60, true),
    (p_project_id, v_org, 'CEILING',       'Strop',             1, 'hsl(220 30% 55%)',  'PanelTop',  70, true),
    (p_project_id, v_org, 'KITCHEN',       'Kuchyně',           3, 'hsl(35 80% 55%)',   'Utensils',  80, true),
    (p_project_id, v_org, 'KIOSK',         'Kiosek',            5, 'hsl(300 45% 55%)',  'Container', 90, true),
    (p_project_id, v_org, 'OUTDOOR_KIOSK', 'Venkovní kiosek',   5, 'hsl(90 45% 45%)',   'Warehouse', 100, true),
    (p_project_id, v_org, 'OUTDOOR_CABLE', 'Venkovní kabel',    5, 'hsl(120 40% 45%)',  'Waves',     110, true),
    (p_project_id, v_org, 'PATCH',         'Patch / rack',      4, 'hsl(0 0% 20%)',     'Server',    120, true),
    (p_project_id, v_org, 'OTHER',         'Jiné',              3, 'hsl(0 0% 40%)',     'HelpCircle',130, true)
  ON CONFLICT (project_id, code) DO NOTHING;
END;
$$;

-- 7. Seed all existing projects
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT id FROM public.projects LOOP
    PERFORM public.seed_endpoint_kinds(p.id);
  END LOOP;
END $$;

-- 8. Extend create_project_tx to seed kinds automatically
CREATE OR REPLACE FUNCTION public.create_project_tx(p_organization_id uuid, p_code text, p_name text, p_address text DEFAULT NULL::text, p_customer text DEFAULT NULL::text, p_timezone text DEFAULT 'Europe/Prague'::text, p_is_demo boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project_id uuid;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if not (
    public.has_org_role(v_user, p_organization_id, 'admin')
    or public.has_org_role(v_user, p_organization_id, 'project_manager')
  ) then
    raise exception 'forbidden: requires admin or project_manager on organization';
  end if;

  insert into public.projects(
    organization_id, code, name, address, customer, timezone, is_demo, created_by
  ) values (
    p_organization_id, p_code, p_name, p_address, p_customer, p_timezone, p_is_demo, v_user
  ) returning id into v_project_id;

  insert into public.project_members(project_id, user_id) values (v_project_id, v_user);

  if not public.has_org_role(v_user, p_organization_id, 'admin') then
    insert into public.user_roles(user_id, organization_id, project_id, role, created_by)
    values (v_user, p_organization_id, v_project_id, 'project_manager', v_user);
  end if;

  -- Seed endpoint kinds for the new project
  perform public.seed_endpoint_kinds(v_project_id);

  return v_project_id;
end;
$function$;
