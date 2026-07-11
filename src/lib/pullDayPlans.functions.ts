import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const listDayPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, floorPlanId: uuid.optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("pull_day_plans")
      .select(
        "id, name, sort_order, planned_date, spool_count, spool_length_m, notes, floor_plan_id, updated_at",
      )
      .eq("project_id", data.projectId)
      .order("sort_order", { ascending: true });
    if (data.floorPlanId) q = q.eq("floor_plan_id", data.floorPlanId);
    const plansRes = await q;
    if (plansRes.error) throw new Error(plansRes.error.message);
    const planIds = (plansRes.data ?? []).map((p) => p.id as string);
    const assignments: Array<{ day_plan_id: string; cable_id: string; sort_order: number }> = [];
    if (planIds.length > 0) {
      const { data: rows, error } = await supabase
        .from("pull_day_plan_cables")
        .select("day_plan_id, cable_id, sort_order")
        .in("day_plan_id", planIds)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        assignments.push({
          day_plan_id: r.day_plan_id as string,
          cable_id: r.cable_id as string,
          sort_order: Number(r.sort_order ?? 0),
        });
      }
    }
    return {
      plans: (plansRes.data ?? []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        sortOrder: Number(p.sort_order ?? 0),
        plannedDate: (p.planned_date as string | null) ?? null,
        spoolCount: Number(p.spool_count ?? 3),
        spoolLengthM: Number(p.spool_length_m ?? 305),
        notes: (p.notes as string | null) ?? null,
        floorPlanId: (p.floor_plan_id as string | null) ?? null,
      })),
      assignments,
    };
  });

export const upsertDayPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        projectId: uuid,
        floorPlanId: uuid.nullable().optional(),
        name: z.string().min(1).max(120),
        sortOrder: z.number().int().default(0),
        plannedDate: z.string().nullable().optional(),
        spoolCount: z.number().int().min(1).max(20).default(3),
        spoolLengthM: z.number().positive().max(5000).default(305),
        notes: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch = {
      project_id: data.projectId,
      floor_plan_id: data.floorPlanId ?? null,
      name: data.name.trim(),
      sort_order: data.sortOrder,
      planned_date: data.plannedDate ?? null,
      spool_count: data.spoolCount,
      spool_length_m: data.spoolLengthM,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await supabase
        .from("pull_day_plans")
        .update(patch as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("pull_day_plans")
      .insert(patch as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const deleteDayPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("pull_day_plans").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignCableToDayPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        dayPlanId: uuid.nullable(),
        cableId: uuid,
        sortOrder: z.number().int().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Remove any existing assignment
    const del = await supabase.from("pull_day_plan_cables").delete().eq("cable_id", data.cableId);
    if (del.error) throw new Error(del.error.message);
    if (data.dayPlanId) {
      const { error } = await supabase
        .from("pull_day_plan_cables")
        .insert({
          project_id: data.projectId,
          day_plan_id: data.dayPlanId,
          cable_id: data.cableId,
          sort_order: data.sortOrder,
        } as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const reorderDayPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        ordered: z.array(z.object({ id: uuid, sortOrder: z.number().int() })),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    for (const o of data.ordered) {
      const { error } = await context.supabase
        .from("pull_day_plans")
        .update({ sort_order: o.sortOrder } as never)
        .eq("id", o.id)
        .eq("project_id", data.projectId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
