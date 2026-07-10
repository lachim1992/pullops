import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PointSchema = z.object({ x: z.number(), y: z.number() });

export const listBundles = createServerFn({ method: "GET" })
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
      .from("cable_bundles")
      .select("id, code, floor_plan_id, rack_id, points, notes, is_primary, updated_at")
      .eq("project_id", data.projectId)
      .order("code");
    if (data.floorPlanId) q = q.eq("floor_plan_id", data.floorPlanId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


export const createBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        floorPlanId: z.string().uuid(),
        code: z.string().min(1).max(80),
        rackId: z.string().uuid().nullable().optional(),
        points: z.array(PointSchema).min(2),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("cable_bundles")
      .insert({
        project_id: data.projectId,
        floor_plan_id: data.floorPlanId,
        code: data.code,
        rack_id: data.rackId ?? null,
        points: data.points,
        notes: data.notes ?? null,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const updateBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        code: z.string().min(1).max(80).optional(),
        rackId: z.string().uuid().nullable().optional(),
        points: z.array(PointSchema).min(2).optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.code !== undefined) patch.code = data.code;
    if (data.rackId !== undefined) patch.rack_id = data.rackId;
    if (data.points !== undefined) patch.points = data.points;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabase
      .from("cable_bundles")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("cable_bundles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
