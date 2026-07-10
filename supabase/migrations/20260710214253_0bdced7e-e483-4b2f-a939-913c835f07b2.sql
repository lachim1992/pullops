-- Checkpoint B: cable registry foundation

create type public.document_kind as enum ('FLOOR_PLAN','SCHEMATIC','OTHER');
create type public.endpoint_kind as enum ('WORKSTATION','AP','CAMERA','PATCH','OTHER');
create type public.cable_status as enum ('PLANNED','PULLED','TERMINATED','TESTED','CANCELLED');

create table public.project_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.document_kind not null default 'OTHER',
  title text not null,
  storage_path text not null,
  mime_type text,
  page_count int,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.project_documents(project_id);
grant select, insert, update, delete on public.project_documents to authenticated;
grant all on public.project_documents to service_role;
alter table public.project_documents enable row level security;
create policy pd_select on public.project_documents for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy pd_insert on public.project_documents for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy pd_update on public.project_documents for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy pd_delete on public.project_documents for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

create table public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid references public.project_documents(id) on delete set null,
  name text not null,
  level int not null default 0,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.floor_plans(project_id);
grant select, insert, update, delete on public.floor_plans to authenticated;
grant all on public.floor_plans to service_role;
alter table public.floor_plans enable row level security;
create policy fp_select on public.floor_plans for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy fp_insert on public.floor_plans for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy fp_update on public.floor_plans for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy fp_delete on public.floor_plans for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

create table public.floor_plan_calibrations (
  id uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null unique references public.floor_plans(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  point_a_norm_x numeric not null check (point_a_norm_x between 0 and 1),
  point_a_norm_y numeric not null check (point_a_norm_y between 0 and 1),
  point_b_norm_x numeric not null check (point_b_norm_x between 0 and 1),
  point_b_norm_y numeric not null check (point_b_norm_y between 0 and 1),
  real_distance_m numeric not null check (real_distance_m > 0),
  calibrated_by uuid references auth.users(id) on delete set null,
  calibrated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.floor_plan_calibrations to authenticated;
grant all on public.floor_plan_calibrations to service_role;
alter table public.floor_plan_calibrations enable row level security;
create policy fpc_select on public.floor_plan_calibrations for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy fpc_insert on public.floor_plan_calibrations for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy fpc_update on public.floor_plan_calibrations for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy fpc_delete on public.floor_plan_calibrations for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

create table public.cable_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  description text,
  default_reserve_m numeric not null default 3.0 check (default_reserve_m >= 0),
  color_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);
grant select, insert, update, delete on public.cable_types to authenticated;
grant all on public.cable_types to service_role;
alter table public.cable_types enable row level security;
create policy ct_select on public.cable_types for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy ct_insert on public.cable_types for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy ct_update on public.cable_types for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy ct_delete on public.cable_types for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

create table public.endpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  floor_plan_id uuid not null references public.floor_plans(id) on delete cascade,
  code text not null,
  label text,
  endpoint_kind public.endpoint_kind not null default 'WORKSTATION',
  norm_x numeric not null check (norm_x between 0 and 1),
  norm_y numeric not null check (norm_y between 0 and 1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);
create index on public.endpoints(project_id);
create index on public.endpoints(floor_plan_id);
grant select, insert, update, delete on public.endpoints to authenticated;
grant all on public.endpoints to service_role;
alter table public.endpoints enable row level security;
create policy ep_select on public.endpoints for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy ep_insert on public.endpoints for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy ep_update on public.endpoints for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy ep_delete on public.endpoints for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

create table public.cable_routes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  floor_plan_id uuid not null references public.floor_plans(id) on delete cascade,
  from_endpoint_id uuid references public.endpoints(id) on delete set null,
  to_endpoint_id uuid references public.endpoints(id) on delete set null,
  name text,
  manual_length_m numeric check (manual_length_m is null or manual_length_m >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.cable_routes(project_id);
grant select, insert, update, delete on public.cable_routes to authenticated;
grant all on public.cable_routes to service_role;
alter table public.cable_routes enable row level security;
create policy cr_select on public.cable_routes for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy cr_insert on public.cable_routes for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy cr_update on public.cable_routes for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy cr_delete on public.cable_routes for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

create table public.cable_route_points (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.cable_routes(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  floor_plan_id uuid not null references public.floor_plans(id) on delete cascade,
  sequence int not null,
  norm_x numeric not null check (norm_x between 0 and 1),
  norm_y numeric not null check (norm_y between 0 and 1),
  created_at timestamptz not null default now(),
  unique (route_id, sequence)
);
create index on public.cable_route_points(route_id);
grant select, insert, update, delete on public.cable_route_points to authenticated;
grant all on public.cable_route_points to service_role;
alter table public.cable_route_points enable row level security;
create policy crp_select on public.cable_route_points for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy crp_insert on public.cable_route_points for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy crp_update on public.cable_route_points for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy crp_delete on public.cable_route_points for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

create table public.cables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  cable_type_id uuid references public.cable_types(id) on delete set null,
  route_id uuid references public.cable_routes(id) on delete set null,
  from_endpoint_id uuid references public.endpoints(id) on delete set null,
  to_endpoint_id uuid references public.endpoints(id) on delete set null,
  status public.cable_status not null default 'PLANNED',
  computed_length_m numeric,
  override_length_m numeric check (override_length_m is null or override_length_m >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);
create index on public.cables(project_id);
create index on public.cables(status);
grant select, insert, update, delete on public.cables to authenticated;
grant all on public.cables to service_role;
alter table public.cables enable row level security;
create policy cb_select on public.cables for select to authenticated using (public.is_project_member(auth.uid(), project_id));
create policy cb_insert on public.cables for insert to authenticated with check (public.is_project_member(auth.uid(), project_id));
create policy cb_update on public.cables for update to authenticated using (public.is_project_member(auth.uid(), project_id)) with check (public.is_project_member(auth.uid(), project_id));
create policy cb_delete on public.cables for delete to authenticated using (public.is_project_member(auth.uid(), project_id));

-- ===== tenant validation =====
create or replace function public.validate_child_project_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proj_org uuid;
begin
  select organization_id into v_proj_org from public.projects where id = new.project_id;
  if v_proj_org is null then raise exception 'project not found'; end if;
  if new.organization_id is null then new.organization_id := v_proj_org;
  elsif new.organization_id <> v_proj_org then raise exception 'tenant mismatch'; end if;
  return new;
end;$$;

create or replace function public.validate_endpoint_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fp_proj uuid;
begin
  select project_id into v_fp_proj from public.floor_plans where id = new.floor_plan_id;
  if v_fp_proj is null or v_fp_proj <> new.project_id then raise exception 'floor_plan does not belong to project'; end if;
  return new;
end;$$;

create or replace function public.validate_route_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fp_proj uuid; v_p uuid;
begin
  select project_id into v_fp_proj from public.floor_plans where id = new.floor_plan_id;
  if v_fp_proj is null or v_fp_proj <> new.project_id then raise exception 'floor_plan does not belong to project'; end if;
  if new.from_endpoint_id is not null then
    select project_id into v_p from public.endpoints where id = new.from_endpoint_id;
    if v_p is null or v_p <> new.project_id then raise exception 'from_endpoint does not belong to project'; end if;
  end if;
  if new.to_endpoint_id is not null then
    select project_id into v_p from public.endpoints where id = new.to_endpoint_id;
    if v_p is null or v_p <> new.project_id then raise exception 'to_endpoint does not belong to project'; end if;
  end if;
  return new;
end;$$;

create or replace function public.validate_route_point_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_r_proj uuid; v_r_fp uuid;
begin
  select project_id, floor_plan_id into v_r_proj, v_r_fp from public.cable_routes where id = new.route_id;
  if v_r_proj is null or v_r_proj <> new.project_id then raise exception 'route does not belong to project'; end if;
  if new.floor_plan_id <> v_r_fp then raise exception 'route point floor_plan mismatch'; end if;
  return new;
end;$$;

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
  return new;
end;$$;

create or replace function public.validate_calibration_tenant()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_p uuid;
begin
  select project_id into v_p from public.floor_plans where id = new.floor_plan_id;
  if v_p is null then raise exception 'floor_plan not found'; end if;
  if new.project_id is null then new.project_id := v_p;
  elsif new.project_id <> v_p then raise exception 'calibration project mismatch'; end if;
  return new;
end;$$;

create trigger t_project_documents_tenant before insert or update on public.project_documents for each row execute function public.validate_child_project_tenant();
create trigger t_floor_plans_tenant before insert or update on public.floor_plans for each row execute function public.validate_child_project_tenant();
create trigger t_cable_types_tenant before insert or update on public.cable_types for each row execute function public.validate_child_project_tenant();
create trigger t_endpoints_tenant_proj before insert or update on public.endpoints for each row execute function public.validate_child_project_tenant();
create trigger t_endpoints_tenant_fp before insert or update on public.endpoints for each row execute function public.validate_endpoint_tenant();
create trigger t_cable_routes_tenant_proj before insert or update on public.cable_routes for each row execute function public.validate_child_project_tenant();
create trigger t_cable_routes_tenant_fp before insert or update on public.cable_routes for each row execute function public.validate_route_tenant();
create trigger t_route_points_tenant before insert or update on public.cable_route_points for each row execute function public.validate_route_point_tenant();
create trigger t_cables_tenant_proj before insert or update on public.cables for each row execute function public.validate_child_project_tenant();
create trigger t_cables_tenant_children before insert or update on public.cables for each row execute function public.validate_cable_tenant();
create trigger t_calibration_tenant before insert or update on public.floor_plan_calibrations for each row execute function public.validate_calibration_tenant();

-- updated_at
create trigger tr_pd_updated before update on public.project_documents for each row execute function public.touch_updated_at();
create trigger tr_fp_updated before update on public.floor_plans for each row execute function public.touch_updated_at();
create trigger tr_fpc_updated before update on public.floor_plan_calibrations for each row execute function public.touch_updated_at();
create trigger tr_ct_updated before update on public.cable_types for each row execute function public.touch_updated_at();
create trigger tr_ep_updated before update on public.endpoints for each row execute function public.touch_updated_at();
create trigger tr_cr_updated before update on public.cable_routes for each row execute function public.touch_updated_at();
create trigger tr_cb_updated before update on public.cables for each row execute function public.touch_updated_at();

-- audit
create trigger tr_pd_audit after insert or update or delete on public.project_documents for each row execute function public.audit_row();
create trigger tr_fp_audit after insert or update or delete on public.floor_plans for each row execute function public.audit_row();
create trigger tr_ep_audit after insert or update or delete on public.endpoints for each row execute function public.audit_row();
create trigger tr_ct_audit after insert or update or delete on public.cable_types for each row execute function public.audit_row();
create trigger tr_cr_audit after insert or update or delete on public.cable_routes for each row execute function public.audit_row();
create trigger tr_cb_audit after insert or update or delete on public.cables for each row execute function public.audit_row();

-- storage policies (bucket vytvořen samostatně)
create policy "pd_storage_select" on storage.objects for select to authenticated
  using (bucket_id = 'project-documents' and public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
create policy "pd_storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-documents' and public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
create policy "pd_storage_update" on storage.objects for update to authenticated
  using (bucket_id = 'project-documents' and public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid));
create policy "pd_storage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-documents' and public.is_project_member(auth.uid(), ((storage.foldername(name))[1])::uuid));