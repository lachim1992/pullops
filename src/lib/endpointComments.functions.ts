import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function endpointCtx(supabase: any, endpointId: string) {
  const { data, error } = await supabase
    .from("endpoints")
    .select("project_id, organization_id")
    .eq("id", endpointId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("endpoint not found");
  return data as { project_id: string; organization_id: string };
}

export const listEndpointComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ endpointId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("endpoint_comments")
      .select("id, body, resolved, resolved_at, resolved_by, author_id, created_at, updated_at")
      .eq("endpoint_id", data.endpointId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createEndpointComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        endpointId: z.string().uuid(),
        body: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await endpointCtx(supabase, data.endpointId);
    const { data: row, error } = await supabase
      .from("endpoint_comments")
      .insert({
        endpoint_id: data.endpointId,
        project_id: ctx.project_id,
        organization_id: ctx.organization_id,
        body: data.body,
        author_id: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const setEndpointCommentResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), resolved: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("endpoint_comments")
      .update({
        resolved: data.resolved,
        resolved_at: data.resolved ? new Date().toISOString() : null,
        resolved_by: data.resolved ? userId : null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEndpointComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("endpoint_comments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
