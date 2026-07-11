import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PointSchema = z.object({ x: z.number(), y: z.number() });
const SegmentTypeSchema = z.enum(["DIRECT", "TRAY", "WALL", "CEILING"]);
const SegmentSchema = z.object({
  type: SegmentTypeSchema,
  extra_pct: z.number().min(0).max(200).default(0),
});


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
      .select("id, code, floor_plan_id, rack_id, points, segments, notes, is_primary, updated_at")
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
        segments: z.array(SegmentSchema).optional(),
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
        segments: data.segments ?? [],
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
        segments: z.array(SegmentSchema).optional(),
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
    if (data.segments !== undefined) patch.segments = data.segments;
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

export const setPrimaryBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ bundleId: z.string().uuid(), isPrimary: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.isPrimary) {
      const { data: b, error: berr } = await supabase
        .from("cable_bundles")
        .select("floor_plan_id")
        .eq("id", data.bundleId)
        .maybeSingle();
      if (berr) throw new Error(berr.message);
      if (!b) throw new Error("bundle not found");
      // unset other primary bundles on the same plan first
      const { error: e1 } = await supabase
        .from("cable_bundles")
        .update({ is_primary: false } as never)
        .eq("floor_plan_id", b.floor_plan_id as string)
        .neq("id", data.bundleId);
      if (e1) throw new Error(e1.message);
    }
    const { error } = await supabase
      .from("cable_bundles")
      .update({ is_primary: data.isPrimary } as never)
      .eq("id", data.bundleId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

