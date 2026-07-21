import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeCableLength, type NormPoint } from "@/lib/length";
import { recomputeOne } from "@/lib/cables.functions";

const uuid = z.string().uuid();

type CableRow = {
  cableId: string;
  code: string;
  cableTypeId: string | null;
  cableTypeCode: string | null;
  fromEndpointId: string | null;
  toEndpointId: string | null;
  fromLabel: string;
  toLabel: string;
  lengthM: number | null;
  reserveM: number;
  totalM: number | null;
  routeId: string | null;
  bundleKey: string | null;
  bundleColor: string | null;
  spoolSerial: string | null;
  status: string;
  note: string | null;
};

/**
 * Returns per-day-plan cables with computed lengths + spool coverage summary
 * for a given floor plan. Used by the plan editor's Metráž & Spulky tab.
 */
export const getPlanMeterage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, floorPlanId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { projectId, floorPlanId } = data;

    const [
      plansRes,
      cablesRes,
      typesRes,
      endpointsRes,
      routesRes,
      pointsRes,
      calRes,
      kindsRes,
      assignRes,
      spoolsRes,
      planSpoolsRes,
      bundlesRes,
      cableFromPortRes,
      cableToPortRes,
    ] = await Promise.all([
      supabase
        .from("pull_day_plans")
        .select("id, name, planned_date, sort_order")
        .eq("project_id", projectId)
        .eq("floor_plan_id", floorPlanId)
        .order("sort_order"),
      supabase
        .from("cables")
        .select(
          "id, code, cable_type_id, from_endpoint_id, to_endpoint_id, from_port_id, to_port_id, status, override_length_m, computed_length_m",
        )
        .eq("project_id", projectId),
      supabase.from("cable_types").select("id, code, default_reserve_m").eq("project_id", projectId),
      supabase
        .from("endpoints")
        .select("id, code, label, endpoint_kind, floor_plan_id")
        .eq("project_id", projectId),
      supabase
        .from("cable_routes")
        .select("id, floor_plan_id, from_endpoint_id, to_endpoint_id, manual_length_m")
        .eq("project_id", projectId),
      supabase
        .from("cable_route_points")
        .select("route_id, norm_x, norm_y, sequence")
        .eq("project_id", projectId)
        .order("sequence"),
      supabase
        .from("floor_plan_calibrations")
        .select("point_a_norm_x, point_a_norm_y, point_b_norm_x, point_b_norm_y, real_distance_m")
        .eq("floor_plan_id", floorPlanId)
        .maybeSingle(),
      supabase.from("endpoint_kinds").select("code, default_reserve_m").eq("project_id", projectId),
      supabase
        .from("pull_day_plan_cables")
        .select("day_plan_id, cable_id"),
      supabase
        .from("spools")
        .select("id, serial_no, cable_type_id, current_length_m, initial_length_m, status")
        .eq("project_id", projectId),
      supabase
        .from("pull_day_plan_spools")
        .select("day_plan_id, spool_id"),
      supabase
        .from("plan_cable_bundles")
        .select("day_plan_id, cable_id, bundle_key, color"),
      supabase.from("patch_ports").select("id, panel_id").limit(0),
      supabase.from("patch_ports").select("id, panel_id").limit(0),
    ]);

    if (plansRes.error) throw new Error(plansRes.error.message);
    if (cablesRes.error) throw new Error(cablesRes.error.message);
    if (endpointsRes.error) throw new Error(endpointsRes.error.message);

    const typeById = new Map<string, { code: string; reserve: number }>();
    for (const t of typesRes.data ?? [])
      typeById.set(t.id as string, {
        code: (t as any).code,
        reserve: Number((t as any).default_reserve_m ?? 0),
      });

    const kindReserve = new Map<string, number>();
    for (const k of kindsRes.data ?? [])
      kindReserve.set((k as any).code, Number((k as any).default_reserve_m ?? 0));

    const epById = new Map<string, any>();
    for (const e of endpointsRes.data ?? []) epById.set(e.id as string, e);

    // Group route points by route
    const routePoints = new Map<string, NormPoint[]>();
    for (const p of pointsRes.data ?? []) {
      const rid = (p as any).route_id as string;
      const arr = routePoints.get(rid) ?? [];
      arr.push({ x: Number((p as any).norm_x), y: Number((p as any).norm_y) });
      routePoints.set(rid, arr);
    }

    // Index routes by endpoint pair (unordered)
    const routeByPair = new Map<string, any>();
    for (const r of routesRes.data ?? []) {
      const rr = r as any;
      if (!rr.from_endpoint_id || !rr.to_endpoint_id) continue;
      const key = [rr.from_endpoint_id, rr.to_endpoint_id].sort().join(":");
      routeByPair.set(key, rr);
    }

    const calibration = calRes.data
      ? {
          a: {
            x: Number((calRes.data as any).point_a_norm_x),
            y: Number((calRes.data as any).point_a_norm_y),
          },
          b: {
            x: Number((calRes.data as any).point_b_norm_x),
            y: Number((calRes.data as any).point_b_norm_y),
          },
          real_distance_m: Number((calRes.data as any).real_distance_m),
        }
      : null;

    const spoolById = new Map<string, any>();
    for (const s of spoolsRes.data ?? []) spoolById.set(s.id as string, s);

    // Map day_plan_id -> assigned spool objects
    const spoolsByPlan = new Map<string, any[]>();
    for (const ps of planSpoolsRes.data ?? []) {
      const dp = (ps as any).day_plan_id as string;
      const sp = spoolById.get((ps as any).spool_id as string);
      if (!sp) continue;
      const arr = spoolsByPlan.get(dp) ?? [];
      arr.push(sp);
      spoolsByPlan.set(dp, arr);
    }

    // Map cable_id -> day_plan_id (explicit assignment)
    const planByCable = new Map<string, string>();
    for (const a of assignRes.data ?? []) {
      planByCable.set((a as any).cable_id as string, (a as any).day_plan_id as string);
    }

    // Bundles by cable within plan
    const bundleByCable = new Map<string, { key: string; color: string | null }>();
    for (const b of bundlesRes.data ?? []) {
      bundleByCable.set((b as any).cable_id as string, {
        key: (b as any).bundle_key as string,
        color: ((b as any).color as string | null) ?? null,
      });
    }

    function reserveFor(epId: string | null, fallbackReserve: number): number {
      if (!epId) return fallbackReserve;
      const ep = epById.get(epId);
      if (!ep?.endpoint_kind) return fallbackReserve;
      const r = kindReserve.get(ep.endpoint_kind as string);
      return r != null ? r : fallbackReserve;
    }

    function computeForCable(c: any): { lengthM: number | null; totalM: number | null; reserveTotal: number; routeId: string | null; note: string | null } {
      const typeInfo = c.cable_type_id ? typeById.get(c.cable_type_id) : null;
      const typeReserve = typeInfo?.reserve ?? 0;
      const reserveFromM = reserveFor(c.from_endpoint_id, typeReserve);
      const reserveToM = reserveFor(c.to_endpoint_id, typeReserve);
      const reserveTotal = reserveFromM + reserveToM;

      if (c.override_length_m != null) {
        const m = Number(c.override_length_m);
        return { lengthM: m, totalM: m, reserveTotal, routeId: null, note: "ruční délka" };
      }

      // Prefer the stored computed_length_m (recomputed via trunk-aware engine)
      if (c.computed_length_m != null) {
        const m = Number(c.computed_length_m);
        return { lengthM: m, totalM: m, reserveTotal, routeId: null, note: null };
      }

      let routeId: string | null = null;
      let pts: NormPoint[] = [];
      let manualLen: number | null = null;
      if (c.from_endpoint_id && c.to_endpoint_id) {
        const key = [c.from_endpoint_id, c.to_endpoint_id].sort().join(":");
        const route = routeByPair.get(key);
        if (route) {
          routeId = route.id as string;
          pts = routePoints.get(route.id as string) ?? [];
          manualLen = route.manual_length_m != null ? Number(route.manual_length_m) : null;
        }
      }
      if (pts.length < 2 && manualLen == null) {
        // straight-line fallback if endpoints on same plan
        const a = c.from_endpoint_id ? epById.get(c.from_endpoint_id) : null;
        const b = c.to_endpoint_id ? epById.get(c.to_endpoint_id) : null;
        if (a && b && a.floor_plan_id === b.floor_plan_id) {
          pts = [
            { x: Number(a.norm_x ?? 0), y: Number(a.norm_y ?? 0) },
            { x: Number(b.norm_x ?? 0), y: Number(b.norm_y ?? 0) },
          ];
        }
      }
      const res = computeCableLength({
        routePoints: pts,
        manualRouteLengthM: manualLen,
        calibration,
        reserveFromM,
        reserveToM,
        overrideCableLengthM: null,
      });
      let note: string | null = null;
      if (res.meters == null) {
        note = !calibration ? "chybí kalibrace" : "chybí trasa";
      } else if (!routeId && manualLen == null && pts.length === 2) {
        note = "odhad přímkou";
      }
      return {
        lengthM: res.meters,
        totalM: res.meters,
        reserveTotal,
        routeId,
        note,
      };
    }

    // Build cables list grouped by plan (only cables belonging to day plans on this floor plan)
    const planIds = new Set((plansRes.data ?? []).map((p: any) => p.id as string));

    // Endpoints belonging to this floor plan (used to gather floor-plan-wide cables)
    const floorPlanEpIds = new Set<string>();
    for (const e of endpointsRes.data ?? []) {
      if ((e as any).floor_plan_id === floorPlanId) floorPlanEpIds.add((e as any).id as string);
    }

    // Backfill stored computed_length_m for cables on this floor plan that have
    // a rack side but no cached length yet.
    const staleCables = (cablesRes.data ?? []).filter((c: any) => {
      const onFp =
        (c.from_endpoint_id && floorPlanEpIds.has(c.from_endpoint_id)) ||
        (c.to_endpoint_id && floorPlanEpIds.has(c.to_endpoint_id));
      if (!onFp) return false;
      if (c.override_length_m != null) return false;
      if (c.computed_length_m != null) return false;
      return c.from_port_id || c.to_port_id || (c.from_endpoint_id && c.to_endpoint_id);
    });
    if (staleCables.length > 0) {
      const results = await Promise.all(
        staleCables.map((c: any) =>
          recomputeOne(supabase, {
            id: c.id,
            cable_type_id: c.cable_type_id,
            route_id: null,
            override_length_m: c.override_length_m,
            from_endpoint_id: c.from_endpoint_id,
            to_endpoint_id: c.to_endpoint_id,
            from_port_id: c.from_port_id,
            to_port_id: c.to_port_id,
          }).catch(() => null),
        ),
      );
      staleCables.forEach((c: any, i: number) => {
        if (results[i] != null) c.computed_length_m = results[i];
      });
    }

    // Build the row for every cable on this floor plan
    const allRows: CableRow[] = [];
    for (const c of cablesRes.data ?? []) {
      const cc = c as any;
      const onFp =
        (cc.from_endpoint_id && floorPlanEpIds.has(cc.from_endpoint_id)) ||
        (cc.to_endpoint_id && floorPlanEpIds.has(cc.to_endpoint_id));
      if (!onFp) continue;
      const comp = computeForCable(cc);
      const epA = cc.from_endpoint_id ? epById.get(cc.from_endpoint_id) : null;
      const epB = cc.to_endpoint_id ? epById.get(cc.to_endpoint_id) : null;
      const bundle = bundleByCable.get(cc.id as string) ?? null;
      allRows.push({
        cableId: cc.id as string,
        code: cc.code as string,
        cableTypeId: (cc.cable_type_id as string | null) ?? null,
        cableTypeCode: cc.cable_type_id ? typeById.get(cc.cable_type_id)?.code ?? null : null,
        fromEndpointId: (cc.from_endpoint_id as string | null) ?? null,
        toEndpointId: (cc.to_endpoint_id as string | null) ?? null,
        fromLabel: epA ? `${epA.code}${epA.label ? " · " + epA.label : ""}` : cc.from_port_id ? "PP" : "—",
        toLabel: epB ? `${epB.code}${epB.label ? " · " + epB.label : ""}` : cc.to_port_id ? "PP" : "—",
        lengthM: comp.lengthM,
        reserveM: comp.reserveTotal,
        totalM: comp.totalM,
        routeId: comp.routeId,
        bundleKey: bundle?.key ?? null,
        bundleColor: bundle?.color ?? null,
        spoolSerial: null,
        status: (cc.status as string) ?? "PLANNED",
        note: comp.note,
      });
    }

    // Floor-plan-wide summary
    const fpsRes = await supabase
      .from("floor_plan_spools")
      .select("spool_id")
      .eq("floor_plan_id", floorPlanId);
    const assignedSpoolIds = new Set<string>(
      (fpsRes.data ?? []).map((r: any) => r.spool_id as string),
    );
    const assignedSpools = (spoolsRes.data ?? [])
      .filter((s: any) => assignedSpoolIds.has(s.id as string))
      .map((s: any) => ({
        id: s.id as string,
        serial: s.serial_no as string,
        cableTypeId: (s.cable_type_id as string | null) ?? null,
        cableTypeCode: s.cable_type_id ? typeById.get(s.cable_type_id)?.code ?? null : null,
        currentM: Number(s.current_length_m ?? 0),
        initialM: Number(s.initial_length_m ?? 0),
        status: (s.status as string) ?? null,
      }));
    const availableSpools = (spoolsRes.data ?? [])
      .filter((s: any) => !assignedSpoolIds.has(s.id as string))
      .map((s: any) => ({
        id: s.id as string,
        serial: s.serial_no as string,
        cableTypeId: (s.cable_type_id as string | null) ?? null,
        cableTypeCode: s.cable_type_id ? typeById.get(s.cable_type_id)?.code ?? null : null,
        currentM: Number(s.current_length_m ?? 0),
        initialM: Number(s.initial_length_m ?? 0),
        status: (s.status as string) ?? null,
      }));

    let overallRouteM = 0;
    let overallReserveM = 0;
    let overallTotalM = 0;
    let overallMissing = 0;
    const overallByType = new Map<string, { typeCode: string | null; routeM: number; reserveM: number; totalM: number; count: number }>();
    for (const r of allRows) {
      const routeM = r.lengthM != null && r.reserveM != null ? r.lengthM - r.reserveM : 0;
      const totM = r.totalM ?? 0;
      if (r.totalM == null) overallMissing += 1;
      overallRouteM += routeM;
      overallReserveM += r.reserveM;
      overallTotalM += totM;
      const key = r.cableTypeId ?? "__none__";
      const cur = overallByType.get(key) ?? { typeCode: r.cableTypeCode, routeM: 0, reserveM: 0, totalM: 0, count: 0 };
      cur.routeM += routeM;
      cur.reserveM += r.reserveM;
      cur.totalM += totM;
      cur.count += 1;
      overallByType.set(key, cur);
    }
    let assignedAvailableM = 0;
    const assignedAvailableByType = new Map<string, number>();
    for (const s of assignedSpools) {
      assignedAvailableM += s.currentM;
      const k = s.cableTypeId ?? "__none__";
      assignedAvailableByType.set(k, (assignedAvailableByType.get(k) ?? 0) + s.currentM);
    }
    const overallCoverage = Array.from(overallByType.entries()).map(([t, v]) => {
      const avail = assignedAvailableByType.get(t) ?? 0;
      return {
        cableTypeId: t === "__none__" ? null : t,
        typeCode: v.typeCode,
        cableCount: v.count,
        neededM: Math.round(v.totalM * 10) / 10,
        availableM: Math.round(avail * 10) / 10,
        deficitM: Math.round(Math.max(0, v.totalM - avail) * 10) / 10,
      };
    });

    const overall = {
      cableCount: allRows.length,
      missingCount: overallMissing,
      routeM: Math.round(overallRouteM * 10) / 10,
      reserveM: Math.round(overallReserveM * 10) / 10,
      totalM: Math.round(overallTotalM * 10) / 10,
      availableM: Math.round(assignedAvailableM * 10) / 10,
      deficitM: Math.round(Math.max(0, overallTotalM - assignedAvailableM) * 10) / 10,
      coverage: overallCoverage,
      cables: allRows,
      assignedSpools,
      availableSpools,
      hasCalibration: !!calibration,
    };

    // Per-day-plan sub-lists (existing behaviour)
    const cablesByPlan = new Map<string, CableRow[]>();
    const rowById = new Map(allRows.map((r) => [r.cableId, r] as const));
    for (const c of cablesRes.data ?? []) {
      const cc = c as any;
      const dp = planByCable.get(cc.id as string);
      if (!dp || !planIds.has(dp)) continue;
      const row = rowById.get(cc.id as string);
      if (!row) continue;
      const arr = cablesByPlan.get(dp) ?? [];
      arr.push(row);
      cablesByPlan.set(dp, arr);
    }

    const plans = (plansRes.data ?? []).map((p: any) => {
      const cables = cablesByPlan.get(p.id as string) ?? [];
      const bundleMax = new Map<string, number>();
      let needed = 0;
      let materialTotal = 0;
      const byType = new Map<string, { neededM: number; typeCode: string | null }>();
      for (const c of cables) {
        const len = c.totalM ?? 0;
        materialTotal += len;
        if (c.bundleKey) {
          const cur = bundleMax.get(c.bundleKey) ?? 0;
          if (len > cur) bundleMax.set(c.bundleKey, len);
        } else {
          needed += len;
        }
        const t = c.cableTypeId ?? "__none__";
        const cur = byType.get(t) ?? { neededM: 0, typeCode: c.cableTypeCode };
        cur.neededM += len;
        byType.set(t, cur);
      }
      for (const v of bundleMax.values()) needed += v;

      const spools = spoolsByPlan.get(p.id as string) ?? [];
      const availableByType = new Map<string, number>();
      let availableTotal = 0;
      for (const s of spools) {
        const t = (s.cable_type_id as string | null) ?? "__none__";
        const rem = Number(s.current_length_m ?? 0);
        availableByType.set(t, (availableByType.get(t) ?? 0) + rem);
        availableTotal += rem;
      }

      const coverage: Array<{ cableTypeId: string | null; typeCode: string | null; neededM: number; availableM: number; deficitM: number }> = [];
      for (const [t, v] of byType.entries()) {
        const avail = availableByType.get(t) ?? 0;
        coverage.push({
          cableTypeId: t === "__none__" ? null : t,
          typeCode: v.typeCode,
          neededM: Math.round(v.neededM * 10) / 10,
          availableM: Math.round(avail * 10) / 10,
          deficitM: Math.round(Math.max(0, v.neededM - avail) * 10) / 10,
        });
      }

      return {
        id: p.id as string,
        name: p.name as string,
        plannedDate: (p.planned_date as string | null) ?? null,
        cables,
        summary: {
          cableCount: cables.length,
          bundleCount: bundleMax.size,
          neededM: Math.round(needed * 10) / 10,
          materialTotalM: Math.round(materialTotal * 10) / 10,
          availableM: Math.round(availableTotal * 10) / 10,
          deficitM: Math.round(Math.max(0, needed - availableTotal) * 10) / 10,
          spoolCount: spools.length,
          coverage,
        },
      };
    });

    return { overall, plans };
  });

export const assignSpoolToFloorPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, floorPlanId: uuid, spoolId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: proj } = await supabase
      .from("projects")
      .select("organization_id")
      .eq("id", data.projectId)
      .single();
    if (!proj) throw new Error("Projekt neexistuje.");
    const ins = await supabase.from("floor_plan_spools").insert({
      project_id: data.projectId,
      organization_id: (proj as any).organization_id,
      floor_plan_id: data.floorPlanId,
      spool_id: data.spoolId,
    } as never);
    if (ins.error) throw new Error(ins.error.message);
    return { ok: true };
  });

export const unassignSpoolFromFloorPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ floorPlanId: uuid, spoolId: uuid }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const del = await supabase
      .from("floor_plan_spools")
      .delete()
      .eq("floor_plan_id", data.floorPlanId)
      .eq("spool_id", data.spoolId);
    if (del.error) throw new Error(del.error.message);
    return { ok: true };
  });

/** Toggle a bundle for a set of cables within a day plan. */
export const setPlanCableBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        dayPlanId: uuid,
        cableIds: z.array(uuid).min(1),
        bundleKey: z.string().min(1).nullable(),
        color: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Remove existing bundle rows for these cables on this plan
    const del = await supabase
      .from("plan_cable_bundles")
      .delete()
      .eq("day_plan_id", data.dayPlanId)
      .in("cable_id", data.cableIds);
    if (del.error) throw new Error(del.error.message);
    if (data.bundleKey) {
      const { data: proj } = await supabase
        .from("projects")
        .select("organization_id")
        .eq("id", data.projectId)
        .single();
      const org = (proj as any).organization_id as string;
      const rows = data.cableIds.map((cid) => ({
        project_id: data.projectId,
        organization_id: org,
        day_plan_id: data.dayPlanId,
        cable_id: cid,
        bundle_key: data.bundleKey!,
        color: data.color ?? null,
      }));
      const ins = await supabase.from("plan_cable_bundles").insert(rows as never);
      if (ins.error) throw new Error(ins.error.message);
    }
    return { ok: true };
  });
