import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeCableLength, type NormPoint } from "@/lib/length";
import { dbErrorMessage } from "@/lib/dbErrors";

const uuid = z.string().uuid();

/** Load full state for the Pull Manager page for a given plan. */
export const getPullManagerState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, dayPlanId: uuid.optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { projectId, dayPlanId } = data;

    const [plansRes, floorPlansRes] = await Promise.all([
      supabase
        .from("pull_day_plans")
        .select("id, name, planned_date, floor_plan_id")
        .eq("project_id", projectId)
        .order("planned_date", { ascending: false, nullsFirst: false }),
      supabase
        .from("floor_plans")
        .select("id, name, level, document_id")
        .eq("project_id", projectId)
        .order("display_order", { ascending: true }),
    ]);
    if (plansRes.error) throw new Error(dbErrorMessage(plansRes.error));
    if (floorPlansRes.error) throw new Error(dbErrorMessage(floorPlansRes.error));

    if (!dayPlanId) {
      return {
        plans: plansRes.data ?? [],
        floorPlans: floorPlansRes.data ?? [],
        endpoints: [],
        cableTypes: [],
        spools: [],
        rounds: [],
        activeRound: null as null | { id: string; roundNumber: number },
      };
    }

    const [endpointsRes, ctRes, spoolsRes, planSpoolsRes, roundsRes] = await Promise.all([
      supabase
        .from("endpoints")
        .select("id, code, label, endpoint_kind, floor_plan_id, norm_x, norm_y")
        .eq("project_id", projectId),
      supabase.from("cable_types").select("id, code").eq("project_id", projectId),
      supabase
        .from("spools")
        .select("id, serial_no, cable_type_id, current_length_m, initial_length_m, status")
        .eq("project_id", projectId),
      supabase
        .from("pull_day_plan_spools")
        .select("spool_id")
        .eq("day_plan_id", dayPlanId),
      supabase
        .from("pull_rounds")
        .select("id, round_number, status, started_at, completed_at, notes, started_by, completed_by")
        .eq("day_plan_id", dayPlanId)
        .order("round_number", { ascending: false }),
    ]);
    if (endpointsRes.error) throw new Error(dbErrorMessage(endpointsRes.error));
    if (ctRes.error) throw new Error(dbErrorMessage(ctRes.error));
    if (spoolsRes.error) throw new Error(dbErrorMessage(spoolsRes.error));
    if (planSpoolsRes.error) throw new Error(dbErrorMessage(planSpoolsRes.error));
    if (roundsRes.error) throw new Error(dbErrorMessage(roundsRes.error));

    const planSpoolIds = new Set((planSpoolsRes.data ?? []).map((r: any) => r.spool_id as string));
    const spoolsOnPlan = (spoolsRes.data ?? []).filter((s: any) => planSpoolIds.has(s.id));

    const rounds = roundsRes.data ?? [];
    const active = rounds.find((r: any) => r.status === "IN_PROGRESS") ?? null;

    let activeItems: any[] = [];
    if (active) {
      const { data: items } = await supabase
        .from("pull_round_items")
        .select(
          "id, cable_id, spool_id, sequence, status, planned_length_m, actual_length_m, started_at, completed_at",
        )
        .eq("round_id", active.id)
        .order("sequence");
      const cableIds = (items ?? []).map((it: any) => it.cable_id);
      let cablesById = new Map<string, any>();
      if (cableIds.length) {
        const { data: cabs } = await supabase
          .from("cables")
          .select("id, code, from_endpoint_id, to_endpoint_id, cable_type_id")
          .in("id", cableIds);
        for (const c of cabs ?? []) cablesById.set(c.id, c);
      }
      activeItems = (items ?? []).map((it: any) => {
        const c = cablesById.get(it.cable_id);
        return {
          ...it,
          cable_code: c?.code ?? null,
          from_endpoint_id: c?.from_endpoint_id ?? null,
          to_endpoint_id: c?.to_endpoint_id ?? null,
          cable_type_id: c?.cable_type_id ?? null,
        };
      });
    }


    return {
      plans: plansRes.data ?? [],
      floorPlans: floorPlansRes.data ?? [],
      endpoints: endpointsRes.data ?? [],
      cableTypes: ctRes.data ?? [],
      spools: spoolsOnPlan,
      rounds,
      activeRound: active
        ? { id: active.id as string, roundNumber: active.round_number as number, items: activeItems }
        : null,
    };
  });

/** Compute planned length between two endpoints via existing cable_route or fallback direct. */
async function computePairLength(
  supabase: any,
  fromEndpointId: string,
  toEndpointId: string,
  cableTypeId: string | null,
): Promise<{ meters: number | null; routeId: string | null; note: string | null }> {
  // Find existing route between these endpoints
  const { data: routes } = await supabase
    .from("cable_routes")
    .select("id, floor_plan_id, manual_length_m")
    .or(
      `and(from_endpoint_id.eq.${fromEndpointId},to_endpoint_id.eq.${toEndpointId}),and(from_endpoint_id.eq.${toEndpointId},to_endpoint_id.eq.${fromEndpointId})`,
    )
    .limit(1);
  const route = routes?.[0] ?? null;

  let cableTypeReserve = 0;
  if (cableTypeId) {
    const { data: ct } = await supabase
      .from("cable_types")
      .select("default_reserve_m")
      .eq("id", cableTypeId)
      .maybeSingle();
    cableTypeReserve = Number(ct?.default_reserve_m ?? 0);
  }

  async function reserveFor(epId: string): Promise<number> {
    const { data: ep } = await supabase
      .from("endpoints")
      .select("project_id, endpoint_kind")
      .eq("id", epId)
      .maybeSingle();
    if (!ep?.endpoint_kind) return cableTypeReserve;
    const { data: k } = await supabase
      .from("endpoint_kinds")
      .select("default_reserve_m")
      .eq("project_id", ep.project_id)
      .eq("code", ep.endpoint_kind)
      .maybeSingle();
    return k?.default_reserve_m != null ? Number(k.default_reserve_m) : cableTypeReserve;
  }
  const [reserveFromM, reserveToM] = await Promise.all([
    reserveFor(fromEndpointId),
    reserveFor(toEndpointId),
  ]);

  if (route) {
    const [{ data: pts }, { data: cal }] = await Promise.all([
      supabase
        .from("cable_route_points")
        .select("norm_x, norm_y, sequence")
        .eq("route_id", route.id)
        .order("sequence"),
      supabase
        .from("floor_plan_calibrations")
        .select("point_a_norm_x, point_a_norm_y, point_b_norm_x, point_b_norm_y, real_distance_m")
        .eq("floor_plan_id", route.floor_plan_id)
        .maybeSingle(),
    ]);
    const routePoints: NormPoint[] = (pts ?? []).map((p: any) => ({
      x: Number(p.norm_x),
      y: Number(p.norm_y),
    }));
    const calibration = cal
      ? {
          a: { x: Number(cal.point_a_norm_x), y: Number(cal.point_a_norm_y) },
          b: { x: Number(cal.point_b_norm_x), y: Number(cal.point_b_norm_y) },
          real_distance_m: Number(cal.real_distance_m),
        }
      : null;
    const result = computeCableLength({
      routePoints,
      manualRouteLengthM: route.manual_length_m ?? null,
      calibration,
      reserveFromM,
      reserveToM,
      overrideCableLengthM: null,
    });
    return { meters: result.meters, routeId: route.id, note: null };
  }

  // Fallback: straight line between endpoints on same floor plan
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase
      .from("endpoints")
      .select("floor_plan_id, norm_x, norm_y")
      .eq("id", fromEndpointId)
      .maybeSingle(),
    supabase
      .from("endpoints")
      .select("floor_plan_id, norm_x, norm_y")
      .eq("id", toEndpointId)
      .maybeSingle(),
  ]);
  if (!a || !b || a.floor_plan_id !== b.floor_plan_id) {
    return {
      meters: null,
      routeId: null,
      note: "Chybí trasa mezi endpointy — vytvořte ji v záložce Trasy pro přesný výpočet.",
    };
  }
  const { data: cal } = await supabase
    .from("floor_plan_calibrations")
    .select("point_a_norm_x, point_a_norm_y, point_b_norm_x, point_b_norm_y, real_distance_m")
    .eq("floor_plan_id", a.floor_plan_id)
    .maybeSingle();
  const calibration = cal
    ? {
        a: { x: Number(cal.point_a_norm_x), y: Number(cal.point_a_norm_y) },
        b: { x: Number(cal.point_b_norm_x), y: Number(cal.point_b_norm_y) },
        real_distance_m: Number(cal.real_distance_m),
      }
    : null;
  const result = computeCableLength({
    routePoints: [
      { x: Number(a.norm_x), y: Number(a.norm_y) },
      { x: Number(b.norm_x), y: Number(b.norm_y) },
    ],
    manualRouteLengthM: null,
    calibration,
    reserveFromM,
    reserveToM,
    overrideCableLengthM: null,
  });
  return {
    meters: result.meters,
    routeId: null,
    note: result.meters == null ? "Chybí kalibrace půdorysu pro výpočet." : "Odhad (přímka).",
  };
}

const PairInput = z.object({
  fromEndpointId: uuid,
  toEndpointId: uuid,
  cableTypeId: uuid.nullable().optional(),
});

/** Given endpoint pairs + plan, propose spool assignment + planned length. */
export const proposePullRoundItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, dayPlanId: uuid, pairs: z.array(PairInput) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Load spools on plan
    const { data: planSpools } = await supabase
      .from("pull_day_plan_spools")
      .select("spool_id, spools(id, serial_no, cable_type_id, current_length_m, status)")
      .eq("day_plan_id", data.dayPlanId);
    const spools = ((planSpools ?? []) as any[])
      .map((r: any) => r.spools)
      .filter(Boolean)
      .map((s: any) => ({
        id: s.id as string,
        serial: s.serial_no as string,
        cableTypeId: (s.cable_type_id as string | null) ?? null,
        currentLengthM: Number(s.current_length_m),
      }));
    const remaining = new Map(spools.map((s) => [s.id, s.currentLengthM] as const));

    const items: Array<{
      fromEndpointId: string;
      toEndpointId: string;
      cableTypeId: string | null;
      plannedLengthM: number | null;
      suggestedSpoolId: string | null;
      note: string | null;
    }> = [];

    for (const p of data.pairs) {
      const { meters, note } = await computePairLength(
        supabase,
        p.fromEndpointId,
        p.toEndpointId,
        p.cableTypeId ?? null,
      );
      // greedy: pick spool of matching type with enough remaining
      let pick: string | null = null;
      const candidates = spools.filter(
        (s) => !p.cableTypeId || s.cableTypeId === p.cableTypeId,
      );
      candidates.sort((a, b) => (remaining.get(a.id)! - remaining.get(b.id)!));
      for (const c of candidates) {
        const rem = remaining.get(c.id) ?? 0;
        if (meters == null || rem >= meters) {
          pick = c.id;
          break;
        }
      }
      if (pick && meters != null) {
        remaining.set(pick, (remaining.get(pick) ?? 0) - meters);
      }
      items.push({
        fromEndpointId: p.fromEndpointId,
        toEndpointId: p.toEndpointId,
        cableTypeId: p.cableTypeId ?? null,
        plannedLengthM: meters,
        suggestedSpoolId: pick,
        note,
      });
    }
    return { items };
  });

/** Create cables for each pair, then start a round via RPC. */
export const startPullRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        dayPlanId: uuid,
        items: z.array(
          z.object({
            fromEndpointId: uuid,
            toEndpointId: uuid,
            cableTypeId: uuid.nullable(),
            spoolId: uuid,
            plannedLengthM: z.number().nullable(),
            code: z.string().min(1),
          }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // fetch organization id
    const { data: proj } = await supabase
      .from("projects")
      .select("organization_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj) throw new Error("project not found");

    // Create cables (one per item)
    const rpcItems: Array<{ cableId: string; spoolId: string; plannedLengthM: number | null }> = [];
    for (const it of data.items) {
      const { data: cab, error } = await supabase
        .from("cables")
        .insert({
          project_id: data.projectId,
          organization_id: (proj as any).organization_id,
          code: it.code,
          cable_type_id: it.cableTypeId,
          from_endpoint_id: it.fromEndpointId,
          to_endpoint_id: it.toEndpointId,
          override_length_m: it.plannedLengthM,
          computed_length_m: it.plannedLengthM,
          created_by: userId,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(dbErrorMessage(error));
      rpcItems.push({
        cableId: (cab as any).id,
        spoolId: it.spoolId,
        plannedLengthM: it.plannedLengthM,
      });
    }

    const { data: roundId, error: rpcErr } = await supabase.rpc("start_pull_round_tx", {
      p_day_plan_id: data.dayPlanId,
      p_items: rpcItems.map((r) => ({
        cableId: r.cableId,
        spoolId: r.spoolId,
        plannedLengthM: r.plannedLengthM,
      })),
    });
    if (rpcErr) throw new Error(dbErrorMessage(rpcErr));
    return { roundId: roundId as string };
  });

export const completePullRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        roundId: uuid,
        actuals: z.array(
          z.object({ itemId: uuid, actualLengthM: z.number().nullable() }),
        ),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("complete_pull_round_tx", {
      p_round_id: data.roundId,
      p_actuals: data.actuals.map((a) => ({
        itemId: a.itemId,
        actualLengthM: a.actualLengthM,
      })),
    });
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

export const cancelPullRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ roundId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("cancel_pull_round_tx", {
      p_round_id: data.roundId,
    });
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

/** Full history of rounds with items (for queue tab). */
export const listPullRoundsDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ dayPlanId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rounds, error } = await supabase
      .from("pull_rounds")
      .select(
        "id, round_number, status, started_at, completed_at, notes, started_by, completed_by",
      )
      .eq("day_plan_id", data.dayPlanId)
      .order("round_number", { ascending: false });
    if (error) throw new Error(dbErrorMessage(error));
    const ids = (rounds ?? []).map((r: any) => r.id as string);
    let items: any[] = [];
    if (ids.length) {
      const { data: it } = await supabase
        .from("pull_round_items")
        .select(
          "id, round_id, cable_id, spool_id, sequence, status, planned_length_m, actual_length_m",
        )
        .in("round_id", ids)
        .order("sequence");
      items = it ?? [];
    }
    return { rounds: rounds ?? [], items };
  });
