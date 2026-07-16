import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

async function projectOrg(supabase: any, projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .single();
  if (error) throw new Error(error.message);
  return (data as { organization_id: string }).organization_id;
}

/**
 * Lists physical spools in the project and which day plan they are assigned to
 * (if any). Used by the plan editor to pick spools for a plan.
 */
export const listSpoolsForPlanning = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [spoolsRes, typesRes, plansRes, assignRes] = await Promise.all([
      supabase
        .from("spools")
        .select(
          "id, serial_no, cable_type_id, initial_length_m, current_length_m, status, manufacturer, batch_no",
        )
        .eq("project_id", data.projectId)
        .order("serial_no", { ascending: true }),
      supabase.from("cable_types").select("id, code").eq("project_id", data.projectId),
      supabase
        .from("pull_day_plans")
        .select("id, name")
        .eq("project_id", data.projectId),
      supabase
        .from("pull_day_plan_spools")
        .select("day_plan_id, spool_id, sort_order")
        .eq("project_id", data.projectId),
    ]);
    if (spoolsRes.error) throw new Error(spoolsRes.error.message);
    if (typesRes.error) throw new Error(typesRes.error.message);
    if (plansRes.error) throw new Error(plansRes.error.message);
    if (assignRes.error) throw new Error(assignRes.error.message);

    const typeCodeById = new Map<string, string>();
    for (const t of typesRes.data ?? []) typeCodeById.set(t.id as string, t.code as string);
    const planNameById = new Map<string, string>();
    for (const p of plansRes.data ?? []) planNameById.set(p.id as string, p.name as string);
    const assignBySpool = new Map<string, string>();
    for (const a of assignRes.data ?? [])
      assignBySpool.set(a.spool_id as string, a.day_plan_id as string);

    return {
      spools: (spoolsRes.data ?? []).map((s: any) => {
        const planId = assignBySpool.get(s.id as string) ?? null;
        return {
          id: s.id as string,
          serialNo: s.serial_no as string,
          cableTypeId: (s.cable_type_id as string | null) ?? null,
          cableTypeCode: s.cable_type_id
            ? typeCodeById.get(s.cable_type_id as string) ?? null
            : null,
          manufacturer: (s.manufacturer as string | null) ?? null,
          batchNo: (s.batch_no as string | null) ?? null,
          initialLengthM: Number(s.initial_length_m),
          currentLengthM: Number(s.current_length_m),
          status: s.status as string,
          assignedPlanId: planId,
          assignedPlanName: planId ? planNameById.get(planId) ?? null : null,
        };
      }),
    };
  });

export const assignSpoolToPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, dayPlanId: uuid, spoolId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const org = await projectOrg(supabase, data.projectId);
    // Enforce exclusivity: remove any prior assignment of this spool.
    const del = await supabase
      .from("pull_day_plan_spools")
      .delete()
      .eq("spool_id", data.spoolId);
    if (del.error) throw new Error(del.error.message);
    const { error } = await supabase.from("pull_day_plan_spools").insert({
      project_id: data.projectId,
      organization_id: org,
      day_plan_id: data.dayPlanId,
      spool_id: data.spoolId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unassignSpoolFromPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ spoolId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("pull_day_plan_spools")
      .delete()
      .eq("spool_id", data.spoolId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
