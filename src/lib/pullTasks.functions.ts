import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeCableLength, type Calibration, type NormPoint } from "@/lib/length";

/**
 * Aggregate project cable lengths and pack them into virtual spools (first-fit-decreasing).
 * spool_length_m is not stored per-type yet — the client passes a default (typ. 305 m box).
 */
export const simulateSpools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        defaultSpoolLengthM: z.number().min(1).default(305),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const spoolLen = data.defaultSpoolLengthM;

    // Load calibrations per plan
    const { data: cals } = await supabase
      .from("floor_plan_calibrations")
      .select(
        "floor_plan_id, point_a_norm_x, point_a_norm_y, point_b_norm_x, point_b_norm_y, real_distance_m",
      );
    const calByPlan = new Map<string, Calibration>();
    for (const c of cals ?? []) {
      calByPlan.set(c.floor_plan_id as string, {
        a: { x: Number(c.point_a_norm_x), y: Number(c.point_a_norm_y) },
        b: { x: Number(c.point_b_norm_x), y: Number(c.point_b_norm_y) },
        real_distance_m: Number(c.real_distance_m),
      });
    }

    const { data: endpoints } = await supabase
      .from("endpoints")
      .select("id, floor_plan_id, endpoint_kind")
      .eq("project_id", data.projectId);
    const epPlan = new Map<string, string>();
    const epKind = new Map<string, string>();
    for (const e of endpoints ?? []) {
      if (e.floor_plan_id) epPlan.set(e.id as string, e.floor_plan_id as string);
      if (e.endpoint_kind) epKind.set(e.id as string, e.endpoint_kind as string);
    }

    // Per-project endpoint kind → reserve map
    const { data: kinds } = await supabase
      .from("endpoint_kinds")
      .select("code, default_reserve_m")
      .eq("project_id", data.projectId);
    const reserveByKind = new Map<string, number>();
    for (const k of kinds ?? []) {
      reserveByKind.set(k.code as string, Number(k.default_reserve_m ?? 0));
    }

    const { data: types } = await supabase
      .from("cable_types")
      .select("id, code, default_reserve_m, meters_per_hour")
      .eq("project_id", data.projectId);
    const typeMap = new Map<string, { code: string; reserve: number; mph: number | null }>();
    for (const t of types ?? []) {
      typeMap.set(t.id as string, {
        code: (t.code as string) ?? "?",
        reserve: Number(t.default_reserve_m ?? 0),
        mph: t.meters_per_hour == null ? null : Number(t.meters_per_hour),
      });
    }

    const resolveReserve = (endpointId: string | null | undefined, fallback: number) => {
      if (!endpointId) return fallback;
      const kind = epKind.get(endpointId);
      if (!kind) return fallback;
      const r = reserveByKind.get(kind);
      return r != null ? r : fallback;
    };

    const { data: cables } = await supabase
      .from("cables")
      .select(
        "id, code, cable_type_id, override_length_m, branch_points, from_endpoint_id, to_endpoint_id",
      )
      .eq("project_id", data.projectId);

    type Row = {
      id: string;
      code: string;
      typeId: string | null;
      typeCode: string;
      meters: number;
    };
    const rows: Row[] = [];
    let totalMeters = 0;
    let missing = 0;
    for (const c of cables ?? []) {
      const t = c.cable_type_id ? typeMap.get(c.cable_type_id as string) : undefined;
      const ctReserve = t?.reserve ?? 0;
      const epId = c.to_endpoint_id as string | null;
      const plan = epId ? epPlan.get(epId) : undefined;
      const cal = plan ? calByPlan.get(plan) : undefined;
      const reserveFromM = resolveReserve(c.from_endpoint_id as string | null, ctReserve);
      const reserveToM = resolveReserve(c.to_endpoint_id as string | null, ctReserve);
      const r = computeCableLength({
        routePoints: (c.branch_points as unknown as NormPoint[]) ?? [],
        manualRouteLengthM: null,
        calibration: cal ?? null,
        reserveFromM,
        reserveToM,
        overrideCableLengthM: (c.override_length_m as number | null) ?? null,
      });
      const meters = r.meters;
      if (meters == null) {
        missing++;
        continue;
      }
      totalMeters += meters;
      rows.push({
        id: c.id as string,
        code: c.code as string,
        typeId: (c.cable_type_id as string | null) ?? null,
        typeCode: t?.code ?? "—",
        meters,
      });
    }

    // First-fit-decreasing per type
    type Spool = { index: number; typeCode: string; used: number; capacity: number; cables: Row[] };
    const spoolsByType = new Map<string, Spool[]>();
    const byType = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.typeCode;
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key)!.push(r);
    }
    for (const [tc, list] of byType) {
      list.sort((a, b) => b.meters - a.meters);
      const spools: Spool[] = [];
      let idx = 1;
      for (const r of list) {
        // cable longer than a spool → mark on its own oversized spool
        if (r.meters > spoolLen) {
          spools.push({
            index: idx++,
            typeCode: tc,
            used: r.meters,
            capacity: r.meters,
            cables: [r],
          });
          continue;
        }
        const fit = spools.find((s) => s.capacity === spoolLen && s.used + r.meters <= spoolLen);
        if (fit) {
          fit.used += r.meters;
          fit.cables.push(r);
        } else {
          spools.push({
            index: idx++,
            typeCode: tc,
            used: r.meters,
            capacity: spoolLen,
            cables: [r],
          });
        }
      }
      spoolsByType.set(tc, spools);
    }

    // Estimated hours per type
    const hoursByType: Array<{ typeCode: string; meters: number; hours: number | null }> = [];
    for (const [tc, list] of byType) {
      const m = list.reduce((a, b) => a + b.meters, 0);
      const typeEntry = Array.from(typeMap.values()).find((t) => t.code === tc);
      const mph = typeEntry?.mph ?? null;
      hoursByType.push({ typeCode: tc, meters: m, hours: mph && mph > 0 ? m / mph : null });
    }

    const spoolsFlat: Spool[] = [];
    for (const [, s] of spoolsByType) spoolsFlat.push(...s);

    return {
      totalCables: rows.length,
      missing,
      totalMeters,
      spoolLengthM: spoolLen,
      spools: spoolsFlat.map((s) => ({
        typeCode: s.typeCode,
        index: s.index,
        used: s.used,
        capacity: s.capacity,
        wasted: Math.max(0, s.capacity - s.used),
        cables: s.cables.map((c) => ({ id: c.id, code: c.code, meters: c.meters })),
      })),
      hoursByType,
    };
  });
