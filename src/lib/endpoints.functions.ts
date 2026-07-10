import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EndpointKind = z.enum(["WORKSTATION", "AP", "CAMERA", "PATCH", "OTHER"]);

const CreateInput = z.object({
  projectId: z.string().uuid(),
  floorPlanId: z.string().uuid(),
  code: z.string().min(1).max(80),
  label: z.string().max(200).optional(),
  kind: EndpointKind,
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  notes: z.string().max(2000).optional(),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  floorPlanId: z.string().uuid().optional(),
  code: z.string().min(1).max(80).optional(),
  label: z.string().max(200).nullable().optional(),
  kind: EndpointKind.optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

async function orgFor(supabase: any, projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("project not found");
  return data.organization_id as string;
}

export const listEndpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        floorPlanId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("endpoints")
      .select("id, code, label, endpoint_kind, floor_plan_id, norm_x, norm_y, notes, updated_at")
      .eq("project_id", data.projectId)
      .order("code", { ascending: true });
    if (data.floorPlanId) q = q.eq("floor_plan_id", data.floorPlanId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const organization_id = await orgFor(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("endpoints")
      .insert({
        project_id: data.projectId,
        organization_id,
        floor_plan_id: data.floorPlanId,
        code: data.code,
        label: data.label ?? null,
        endpoint_kind: data.kind,
        norm_x: data.x,
        norm_y: data.y,
        notes: data.notes ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.floorPlanId !== undefined) patch.floor_plan_id = data.floorPlanId;
    if (data.code !== undefined) patch.code = data.code;
    if (data.label !== undefined) patch.label = data.label;
    if (data.kind !== undefined) patch.endpoint_kind = data.kind;
    if (data.x !== undefined) patch.norm_x = data.x;
    if (data.y !== undefined) patch.norm_y = data.y;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabase.from("endpoints").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("endpoints").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const BulkImportInput = z.object({
  projectId: z.string().uuid(),
  floorPlanId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        code: z.string().min(1),
        label: z.string().optional(),
        kind: EndpointKind.optional(),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }),
    )
    .min(1)
    .max(2000),
});

export const bulkImportEndpoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BulkImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const organization_id = await orgFor(supabase, data.projectId);
    const payload = data.rows.map((r) => ({
      project_id: data.projectId,
      organization_id,
      floor_plan_id: data.floorPlanId,
      code: r.code,
      label: r.label ?? null,
      endpoint_kind: r.kind ?? "WORKSTATION",
      norm_x: r.x,
      norm_y: r.y,
    }));
    const { error, count } = await supabase
      .from("endpoints")
      .insert(payload, { count: "exact" });
    if (error) throw new Error(error.message);
    return { inserted: count ?? payload.length };
  });
