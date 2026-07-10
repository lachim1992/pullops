import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProjectStatus = z.enum([
  "planning",
  "active",
  "on_hold",
  "completed",
  "archived",
]);

const CreateProjectInput = z.object({
  organizationId: z.string().uuid(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional().nullable(),
  customer: z.string().max(200).optional().nullable(),
  timezone: z.string().default("Europe/Prague"),
  is_demo: z.boolean().default(false),
});

const UpdateProjectInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable(),
  customer: z.string().max(200).nullable(),
  status: ProjectStatus,
  default_cable_type: z.string().max(64).nullable(),
  default_rack_reserve_m: z.number().nullable(),
  default_endpoint_reserve_m: z.number().nullable(),
  default_vertical_allowance_m: z.number().nullable(),
  default_handling_factor: z.number().nullable(),
  use_compound_panel_port_ids: z.boolean(),
  is_demo: z.boolean(),
});

const RoleEnum = z.enum([
  "admin",
  "project_manager",
  "site_lead",
  "puller",
  "rack_technician",
  "test_technician",
  "viewer",
]);

const AddProjectMemberInput = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  role: RoleEnum.optional(),
});
const RemoveProjectMemberInput = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
});
const SetProjectRoleInput = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  role: RoleEnum,
  grant: z.boolean(),
});

export const listMyProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ organizationId: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("projects")
      .select("id, organization_id, code, name, status, is_demo, created_at")
      .order("created_at", { ascending: false });
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Projekt nenalezen");
    return row;
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateProjectInput.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const { data: id, error } = await supabase.rpc("create_project_tx", {
      p_organization_id: data.organizationId,
      p_code: data.code,
      p_name: data.name,
      p_address: data.address,
      p_customer: data.customer,
      p_timezone: data.timezone,
      p_is_demo: data.is_demo,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateProjectInput.parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    };
    const { error } = await supabase.rpc("update_project_tx", {
      p_project_id: data.id,
      p_name: data.name,
      p_address: data.address,
      p_customer: data.customer,
      p_status: data.status,
      p_default_cable_type: data.default_cable_type,
      p_default_rack_reserve_m: data.default_rack_reserve_m,
      p_default_endpoint_reserve_m: data.default_endpoint_reserve_m,
      p_default_vertical_allowance_m: data.default_vertical_allowance_m,
      p_default_handling_factor: data.default_handling_factor,
      p_use_compound_panel_port_ids: data.use_compound_panel_port_ids,
      p_is_demo: data.is_demo,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listProjectMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("project_members")
      .select("user_id, joined_at")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    const userIds = (rows ?? []).map((r) => r.user_id);
    const profilesById = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profiles, error: perr } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      if (perr) throw new Error(perr.message);
      for (const p of profiles ?? []) profilesById.set(p.id, p.full_name ?? "");
    }
    const { data: roles, error: rerr } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("project_id", data.projectId);
    if (rerr) throw new Error(rerr.message);
    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }
    return (rows ?? []).map((r) => ({
      user_id: r.user_id,
      full_name: profilesById.get(r.user_id) ?? "",
      joined_at: r.joined_at,
      roles: rolesByUser.get(r.user_id) ?? [],
    }));
  });

export const addProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AddProjectMemberInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("add_project_member_tx", {
      p_project_id: data.projectId,
      p_user_id: data.userId,
      p_role: data.role,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RemoveProjectMemberInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("remove_project_member_tx", {
      p_project_id: data.projectId,
      p_user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setProjectRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetProjectRoleInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("set_project_role_tx", {
      p_project_id: data.projectId,
      p_user_id: data.userId,
      p_role: data.role,
      p_grant: data.grant,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
