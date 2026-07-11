
-- CP-00 SECURITY DEFINER hardening.
-- Cíl: minimalizovat EXECUTE granty. Trigger/interní SDF funkce nesmí být volatelné z klienta.
-- Kli entské RPC SDF funkce zůstávají volatelné pouze pro authenticated (nikoli anon/PUBLIC).

DO $$
DECLARE
  fn_sig text;
  internal_fns text[] := ARRAY[
    'public.audit_row()',
    'public.autofill_patch_ports()',
    'public.handle_new_user()',
    'public.seed_endpoint_kinds(uuid)',
    'public.validate_bundle_tenant()',
    'public.validate_cable_tenant()',
    'public.validate_calibration_tenant()',
    'public.validate_child_project_tenant()',
    'public.validate_endpoint_cable_group_tenant()',
    'public.validate_endpoint_tenant()',
    'public.validate_patch_panel_tenant()',
    'public.validate_patch_port_tenant()',
    'public.validate_project_member_tenant()',
    'public.validate_rack_tenant()',
    'public.validate_route_point_tenant()',
    'public.validate_route_tenant()',
    'public.validate_user_role_tenant()'
  ];
  client_fns text[] := ARRAY[
    'public.add_org_member_by_email_tx(uuid, text)',
    'public.add_project_member_tx(uuid, uuid, app_role)',
    'public.create_organization_tx(text)',
    'public.create_project_tx(uuid, text, text, text, text, text, boolean)',
    'public.remove_org_member_tx(uuid, uuid)',
    'public.remove_project_member_tx(uuid, uuid)',
    'public.set_org_role_tx(uuid, uuid, app_role, boolean)',
    'public.set_project_role_tx(uuid, uuid, app_role, boolean)',
    'public.update_project_tx(uuid, text, text, text, project_status, text, numeric, numeric, numeric, numeric, boolean, boolean)',
    'public.has_org_role(uuid, uuid, app_role)',
    'public.has_project_role(uuid, uuid, app_role)',
    'public.is_org_member(uuid, uuid)',
    'public.is_project_member(uuid, uuid)',
    'public.share_org(uuid, uuid)'
  ];
BEGIN
  FOREACH fn_sig IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_sig);
  END LOOP;

  FOREACH fn_sig IN ARRAY client_fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_sig);
  END LOOP;
END $$;
