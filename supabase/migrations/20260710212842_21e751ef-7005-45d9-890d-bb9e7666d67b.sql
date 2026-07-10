
revoke execute on function public.is_org_member(uuid, uuid) from public;
revoke execute on function public.has_org_role(uuid, uuid, public.app_role) from public;
revoke execute on function public.has_project_role(uuid, uuid, public.app_role) from public;
revoke execute on function public.is_project_member(uuid, uuid) from public;
revoke execute on function public.share_org(uuid, uuid) from public;
revoke execute on function public.create_organization_tx(text) from public;
revoke execute on function public.create_project_tx(uuid, text, text, text, text, text, boolean) from public;
revoke execute on function public.update_project_tx(uuid, text, text, text, public.project_status, text, numeric, numeric, numeric, numeric, boolean, boolean) from public;
revoke execute on function public.add_project_member_tx(uuid, uuid, public.app_role) from public;
revoke execute on function public.remove_project_member_tx(uuid, uuid) from public;
revoke execute on function public.set_project_role_tx(uuid, uuid, public.app_role, boolean) from public;
revoke execute on function public.set_org_role_tx(uuid, uuid, public.app_role, boolean) from public;
revoke execute on function public.add_org_member_by_email_tx(uuid, text) from public;
revoke execute on function public.remove_org_member_tx(uuid, uuid) from public;
