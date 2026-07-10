import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listRacks = createServerFn({ method: "GET" })
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
      .from("racks")
      .select("id, code, name, x, y, floor_plan_id, notes, updated_at")
      .eq("project_id", data.projectId)
      .order("code");
    if (data.floorPlanId) q = q.eq("floor_plan_id", data.floorPlanId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createRack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        floorPlanId: z.string().uuid(),
        code: z.string().min(1).max(80),
        name: z.string().max(200).optional(),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
        notes: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("racks")
      .insert({
        project_id: data.projectId,
        floor_plan_id: data.floorPlanId,
        code: data.code,
        name: data.name ?? null,
        x: data.x ?? 0.5,
        y: data.y ?? 0.5,
        notes: data.notes ?? null,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const updateRack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        code: z.string().min(1).max(80).optional(),
        name: z.string().max(200).nullable().optional(),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.code !== undefined) patch.code = data.code;
    if (data.name !== undefined) patch.name = data.name;
    if (data.x !== undefined) patch.x = data.x;
    if (data.y !== undefined) patch.y = data.y;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabase.from("racks").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("racks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignPanelToRack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        panelId: z.string().uuid(),
        rackId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("patch_panels")
      .update({ rack_id: data.rackId } as never)
      .eq("id", data.panelId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
