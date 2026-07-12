import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const priorityEnum = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
const statusEnum = z.enum(["PLANNED", "IN_PROGRESS", "DONE", "CANCELLED"]);

async function projectOrg(supabase: any, projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single();
  if (error) throw new Error(error.message);
  return (data as { organization_id: string }).organization_id;
}

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
        "id, name, sort_order, planned_date, spool_count, spool_length_m, notes, floor_plan_id, updated_at, assigned_to, priority, status",
      )
      .eq("project_id", data.projectId)
      .order("sort_order", { ascending: true });
    if (data.floorPlanId) q = q.eq("floor_plan_id", data.floorPlanId);
    const plansRes = await q;
    if (plansRes.error) throw new Error(plansRes.error.message);
    const planIds = (plansRes.data ?? []).map((p) => p.id as string);
    const assignments: Array<{ day_plan_id: string; cable_id: string; sort_order: number }> = [];
    const photosByPlan = new Map<string, number>();
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
      const ph = await supabase
        .from("pull_day_plan_photos" as never)
        .select("day_plan_id")
        .in("day_plan_id", planIds);
      for (const r of (ph.data as any[]) ?? []) {
        const k = r.day_plan_id as string;
        photosByPlan.set(k, (photosByPlan.get(k) ?? 0) + 1);
      }
    }
    return {
      plans: (plansRes.data ?? []).map((p: any) => ({
        id: p.id as string,
        name: p.name as string,
        sortOrder: Number(p.sort_order ?? 0),
        plannedDate: (p.planned_date as string | null) ?? null,
        spoolCount: Number(p.spool_count ?? 3),
        spoolLengthM: Number(p.spool_length_m ?? 305),
        notes: (p.notes as string | null) ?? null,
        floorPlanId: (p.floor_plan_id as string | null) ?? null,
        assignedTo: (p.assigned_to as string | null) ?? null,
        priority: (p.priority as string) ?? "NORMAL",
        status: (p.status as string) ?? "PLANNED",
        photoCount: photosByPlan.get(p.id as string) ?? 0,
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
        notes: z.string().max(4000).nullable().optional(),
        assignedTo: uuid.nullable().optional(),
        priority: priorityEnum.optional(),
        status: statusEnum.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {
      project_id: data.projectId,
      floor_plan_id: data.floorPlanId ?? null,
      name: data.name.trim(),
      sort_order: data.sortOrder,
      planned_date: data.plannedDate ?? null,
      spool_count: data.spoolCount,
      spool_length_m: data.spoolLengthM,
      notes: data.notes ?? null,
    };
    if (data.assignedTo !== undefined) patch.assigned_to = data.assignedTo;
    if (data.priority) patch.priority = data.priority;
    if (data.status) patch.status = data.status;
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

// ================ PHOTOS ================

export const listDayPlanPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dayPlanId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("pull_day_plan_photos" as never)
      .select("id, storage_path, caption, created_at, created_by")
      .eq("day_plan_id", data.dayPlanId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const out: Array<{ id: string; url: string; caption: string | null; createdAt: string }> = [];
    for (const r of (rows as any[]) ?? []) {
      const sig = await supabase.storage
        .from("pull-day-plan-photos")
        .createSignedUrl(r.storage_path as string, 3600);
      out.push({
        id: r.id as string,
        url: sig.data?.signedUrl ?? "",
        caption: (r.caption as string | null) ?? null,
        createdAt: r.created_at as string,
      });
    }
    return out;
  });

export const addDayPlanPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        dayPlanId: uuid,
        storagePath: z.string().min(1),
        caption: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const org = await projectOrg(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("pull_day_plan_photos" as never)
      .insert({
        project_id: data.projectId,
        organization_id: org,
        day_plan_id: data.dayPlanId,
        storage_path: data.storagePath,
        caption: data.caption ?? null,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const deleteDayPlanPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("pull_day_plan_photos" as never)
      .select("storage_path")
      .eq("id", data.id)
      .single();
    const path = (row as any)?.storage_path as string | undefined;
    if (path) {
      await supabase.storage.from("pull-day-plan-photos").remove([path]);
    }
    const { error } = await supabase
      .from("pull_day_plan_photos" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
