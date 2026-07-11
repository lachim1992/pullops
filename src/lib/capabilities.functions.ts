import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbErrorMessage } from "@/lib/dbErrors";

const uuid = z.string().uuid();

/** Whether the current user is org-level admin in any organization. */
export const getMyCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, project_id")
      .eq("user_id", userId)
      .is("project_id", null)
      .eq("role", "admin")
      .limit(1);
    if (error) throw new Error(dbErrorMessage(error));
    return { isOrgAdminAnywhere: (data ?? []).length > 0 };
  });

/** Project-scoped capabilities: is admin (org) or project_manager on that project. */
export const getMyProjectCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Fetch org of the project first
    const { data: proj, error: perr } = await supabase
      .from("projects")
      .select("organization_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (perr) throw new Error(dbErrorMessage(perr));
    if (!proj) return { isProjectAdmin: false, isProjectManager: false, canManage: false };

    const { data: roles, error: rerr } = await supabase
      .from("user_roles")
      .select("role, organization_id, project_id")
      .eq("user_id", userId);
    if (rerr) throw new Error(dbErrorMessage(rerr));

    const isOrgAdmin = (roles ?? []).some(
      (r) =>
        r.organization_id === proj.organization_id && r.project_id === null && r.role === "admin",
    );
    const isProjectManager = (roles ?? []).some(
      (r) => r.project_id === data.projectId && r.role === "project_manager",
    );
    return {
      isProjectAdmin: isOrgAdmin,
      isProjectManager,
      canManage: isOrgAdmin || isProjectManager,
    };
  });
