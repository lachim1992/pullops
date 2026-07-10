import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateOrgInput = z.object({ name: z.string().min(1).max(120) });
const UpdateOrgInput = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
});
const AddMemberInput = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
});
const RemoveMemberInput = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
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
const SetOrgRoleInput = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: RoleEnum,
  grant: z.boolean(),
});

export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id, organizations!inner(id, name, created_at)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.organizations.id,
      name: r.organizations.name,
      created_at: r.organizations.created_at,
    }));
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => CreateOrgInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: orgId, error } = await supabase.rpc("create_organization_tx", {
      p_name: data.name,
    });
    if (error) throw new Error(error.message);
    return { id: orgId as string };
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateOrgInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("organizations")
      .update({ name: data.name })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listOrgMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("organization_members")
      .select("user_id, joined_at")
      .eq("organization_id", data.organizationId);
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
      .eq("organization_id", data.organizationId)
      .is("project_id", null);
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

export const addOrgMemberByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AddMemberInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: uid, error } = await supabase.rpc("add_org_member_by_email_tx", {
      p_organization_id: data.organizationId,
      p_email: data.email,
    });
    if (error) throw new Error(error.message);
    return { userId: uid as string };
  });

export const removeOrgMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => RemoveMemberInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("remove_org_member_tx", {
      p_organization_id: data.organizationId,
      p_user_id: data.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setOrgRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SetOrgRoleInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("set_org_role_tx", {
      p_organization_id: data.organizationId,
      p_user_id: data.userId,
      p_role: data.role,
      p_grant: data.grant,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, default_organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      id: userId,
      email: (claims as { email?: string }).email ?? "",
      full_name: data?.full_name ?? "",
      default_organization_id: data?.default_organization_id ?? null,
    };
  });
