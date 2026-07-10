
-- ===== patch_panels =====
create table public.patch_panels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  floor_plan_id uuid references public.floor_plans(id) on delete set null,
  code text not null,
  name text,
  port_count int not null default 24 check (port_count > 0 and port_count <= 288),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);
create index on public.patch_panels(project_id);
grant select, insert, update, delete on public.patch_panels to authenticated;
grant all on public.patch_panels to service_role;
alter table public.patch_panels enable row level security;
create policy pp_select on public.patch_panels for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy pp_insert on public.patch_panels for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy pp_update on public.patch_panels for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy pp_delete on public.patch_panels for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

-- ===== patch_ports =====
create table public.patch_ports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  panel_id uuid not null references public.patch_panels(id) on delete cascade,
  port_number int not null check (port_number > 0),
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (panel_id, port_number)
);
create index on public.patch_ports(project_id);
create index on public.patch_ports(panel_id);
grant select, insert, update, delete on public.patch_ports to authenticated;
grant all on public.patch_ports to service_role;
alter table public.patch_ports enable row level security;
create policy pt_select on public.patch_ports for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy pt_insert on public.patch_ports for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy pt_update on public.patch_ports for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy pt_delete on public.patch_ports for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

-- ===== extend cables with ports =====
alter table public.cables add column from_port_id uuid references public.patch_ports(id) on delete set null;
alter table public.cables add column to_port_id uuid references public.patch_ports(id) on delete set null;

-- ===== tenant validation =====
create or replace function public.validate_patch_panel_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fp_proj uuid;
begin
  if new.floor_plan_id is not null then
    select project_id into v_fp_proj from public.floor_plans where id = new.floor_plan_id;
    if v_fp_proj is null or v_fp_proj <> new.project_id then
      raise exception 'floor_plan does not belong to project';
    end if;
  end if;
  return new;
end;$$;

create or replace function public.validate_patch_port_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_p uuid;
begin
  select project_id into v_p from public.patch_panels where id = new.panel_id;
  if v_p is null then raise exception 'panel not found'; end if;
  if new.project_id is null then new.project_id := v_p;
  elsif new.project_id <> v_p then raise exception 'port project mismatch'; end if;
  return new;
end;$$;

-- extend cable tenant validation to check ports
create or replace function public.validate_cable_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_p uuid;
begin
  if new.cable_type_id is not null then
    select project_id into v_p from public.cable_types where id = new.cable_type_id;
    if v_p is null or v_p <> new.project_id then raise exception 'cable_type does not belong to project'; end if;
  end if;
  if new.route_id is not null then
    select project_id into v_p from public.cable_routes where id = new.route_id;
    if v_p is null or v_p <> new.project_id then raise exception 'route does not belong to project'; end if;
  end if;
  if new.from_endpoint_id is not null then
    select project_id into v_p from public.endpoints where id = new.from_endpoint_id;
    if v_p is null or v_p <> new.project_id then raise exception 'from_endpoint does not belong to project'; end if;
  end if;
  if new.to_endpoint_id is not null then
    select project_id into v_p from public.endpoints where id = new.to_endpoint_id;
    if v_p is null or v_p <> new.project_id then raise exception 'to_endpoint does not belong to project'; end if;
  end if;
  if new.from_port_id is not null then
    select project_id into v_p from public.patch_ports where id = new.from_port_id;
    if v_p is null or v_p <> new.project_id then raise exception 'from_port does not belong to project'; end if;
  end if;
  if new.to_port_id is not null then
    select project_id into v_p from public.patch_ports where id = new.to_port_id;
    if v_p is null or v_p <> new.project_id then raise exception 'to_port does not belong to project'; end if;
  end if;
  return new;
end;$$;

create trigger t_patch_panels_tenant_proj before insert or update on public.patch_panels for each row execute function public.validate_child_project_tenant();
create trigger t_patch_panels_tenant_fp before insert or update on public.patch_panels for each row execute function public.validate_patch_panel_tenant();
create trigger t_patch_ports_tenant before insert or update on public.patch_ports for each row execute function public.validate_patch_port_tenant();

create trigger tr_pp_updated before update on public.patch_panels for each row execute function public.touch_updated_at();
create trigger tr_pt_updated before update on public.patch_ports for each row execute function public.touch_updated_at();

create trigger tr_pp_audit after insert or update or delete on public.patch_panels for each row execute function public.audit_row();
create trigger tr_pt_audit after insert or update or delete on public.patch_ports for each row execute function public.audit_row();

-- ===== auto-create ports when panel is created =====
create or replace function public.autofill_patch_ports()
returns trigger language plpgsql security definer set search_path = public as $$
declare i int;
begin
  for i in 1..new.port_count loop
    insert into public.patch_ports(project_id, panel_id, port_number)
    values (new.project_id, new.id, i);
  end loop;
  return new;
end;$$;

create trigger tr_patch_panels_autofill after insert on public.patch_panels for each row execute function public.autofill_patch_ports();
