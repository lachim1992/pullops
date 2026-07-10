CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_org uuid;
  v_proj uuid;
  v_before jsonb;
  v_after jsonb;
  v_entity uuid;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_after := null;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
  else
    v_before := null;
    v_after := to_jsonb(new);
  end if;

  v_entity := nullif(coalesce(v_after->>'id', v_before->>'id'), '')::uuid;

  v_org := coalesce(
    (v_after->>'organization_id')::uuid,
    (v_before->>'organization_id')::uuid
  );
  v_proj := coalesce(
    (v_after->>'project_id')::uuid,
    (v_before->>'project_id')::uuid
  );

  if tg_table_name = 'organizations' then
    v_org := coalesce(v_org, v_entity);
  elsif tg_table_name = 'projects' then
    v_proj := coalesce(v_proj, v_entity);
  end if;

  insert into public.audit_events(
    organization_id, project_id, entity_type, entity_id, action,
    before_json, after_json, user_id
  ) values (
    v_org, v_proj, tg_table_name, v_entity, tg_op,
    v_before, v_after, auth.uid()
  );
  return coalesce(new, old);
end;
$function$;