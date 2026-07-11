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

export const getPullModeData = createServerFn({ method: "GET" })
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

    const [plansRes, calsRes, endpointsRes, bundlesRes, typesRes, kindsRes, cablesRes, panelsRes] =
      await Promise.all([
        supabase
          .from("floor_plans")
          .select("id, name, level, display_order, document_id")
          .eq("project_id", data.projectId)
          .order("display_order", { ascending: true })
          .order("level", { ascending: true }),
        supabase
          .from("floor_plan_calibrations")
          .select(
            "floor_plan_id, point_a_norm_x, point_a_norm_y, point_b_norm_x, point_b_norm_y, real_distance_m",
          )
          .eq("project_id", data.projectId),
        supabase
          .from("endpoints")
          .select("id, code, floor_plan_id, endpoint_kind, norm_x, norm_y")
          .eq("project_id", data.projectId),
        supabase
          .from("cable_bundles")
          .select("id, code, floor_plan_id, points")
          .eq("project_id", data.projectId),
        supabase
          .from("cable_types")
          .select("id, code, default_reserve_m, meters_per_hour")
          .eq("project_id", data.projectId),
        supabase
          .from("endpoint_kinds")
          .select("code, default_reserve_m")
          .eq("project_id", data.projectId),
        supabase
          .from("cables")
          .select(
            "id, code, status, cable_type_id, override_length_m, branch_points, from_endpoint_id, to_endpoint_id, bundle_id, notes",
          )
          .eq("project_id", data.projectId)
          .order("code", { ascending: true }),
        supabase
          .from("patch_panels")
          .select("id, code, name, floor_plan_id, port_count")
          .eq("project_id", data.projectId),
      ]);

    for (const res of [plansRes, calsRes, endpointsRes, bundlesRes, typesRes, kindsRes, cablesRes, panelsRes]) {
      if (res.error) throw new Error(res.error.message);
    }

    const docIds = (plansRes.data ?? [])
      .map((p) => p.document_id as string | null)
      .filter((v): v is string => Boolean(v));
    const docsById = new Map<string, { mime_type: string | null; storage_path: string }>();
    if (docIds.length > 0) {
      const { data: docs, error } = await supabase
        .from("project_documents")
        .select("id, storage_path, mime_type")
        .in("id", docIds);
      if (error) throw new Error(error.message);
      for (const d of docs ?? []) {
        docsById.set(d.id as string, {
          storage_path: d.storage_path as string,
          mime_type: (d.mime_type as string | null) ?? null,
        });
      }
    }

    const plans = [];
    for (const p of plansRes.data ?? []) {
      const doc = p.document_id ? docsById.get(p.document_id as string) : undefined;
      let documentUrl: string | null = null;
      if (doc?.storage_path) {
        const { data: signed } = await supabase.storage
          .from("project-documents")
          .createSignedUrl(doc.storage_path, 60 * 30);
        documentUrl = signed?.signedUrl ?? null;
      }
      plans.push({
        id: p.id as string,
        name: p.name as string,
        level: Number(p.level ?? 0),
        displayOrder: Number(p.display_order ?? 0),
        documentUrl,
        mimeType: doc?.mime_type ?? null,
      });
    }

    const calByPlan = new Map<string, Calibration>();
    for (const c of calsRes.data ?? []) {
      calByPlan.set(c.floor_plan_id as string, {
        a: { x: Number(c.point_a_norm_x), y: Number(c.point_a_norm_y) },
        b: { x: Number(c.point_b_norm_x), y: Number(c.point_b_norm_y) },
        real_distance_m: Number(c.real_distance_m),
      });
    }

    const endpointById = new Map<
      string,
      { id: string; code: string; floorPlanId: string | null; kind: string | null; x: number; y: number }
    >();
    for (const e of endpointsRes.data ?? []) {
      endpointById.set(e.id as string, {
        id: e.id as string,
        code: e.code as string,
        floorPlanId: (e.floor_plan_id as string | null) ?? null,
        kind: (e.endpoint_kind as string | null) ?? null,
        x: Number(e.norm_x),
        y: Number(e.norm_y),
      });
    }

    const reserveByKind = new Map<string, number>();
    for (const k of kindsRes.data ?? []) {
      reserveByKind.set(k.code as string, Number(k.default_reserve_m ?? 0));
    }

    const typeMap = new Map<string, { code: string; reserve: number; mph: number | null }>();
    for (const t of typesRes.data ?? []) {
      typeMap.set(t.id as string, {
        code: (t.code as string) ?? "—",
        reserve: Number(t.default_reserve_m ?? 0),
        mph: t.meters_per_hour == null ? null : Number(t.meters_per_hour),
      });
    }

    const resolveReserve = (endpointId: string | null | undefined, fallback: number) => {
      if (!endpointId) return fallback;
      const ep = endpointById.get(endpointId);
      if (!ep?.kind) return fallback;
      const r = reserveByKind.get(ep.kind);
      return r != null ? r : fallback;
    };

    type PullCable = {
      id: string;
      code: string;
      status: string;
      typeCode: string;
      meters: number | null;
      floorPlanId: string | null;
      fromEndpointId: string | null;
      fromEndpointCode: string | null;
      toEndpointId: string | null;
      toEndpointCode: string | null;
      branchPoints: NormPoint[];
      bundleId: string | null;
      notes: string | null;
    };

    const bundleCodeById = new Map<string, string>();
    for (const b of bundlesRes.data ?? []) {
      bundleCodeById.set(b.id as string, b.code as string);
    }

    const cableRows: PullCable[] = [];
    let missing = 0;
    let totalMeters = 0;
    for (const c of cablesRes.data ?? []) {
      const type = c.cable_type_id ? typeMap.get(c.cable_type_id as string) : undefined;
      const fromEp = endpointById.get(c.from_endpoint_id as string);
      const toEp = endpointById.get(c.to_endpoint_id as string);
      const planId = toEp?.floorPlanId ?? fromEp?.floorPlanId ?? null;
      const ctReserve = type?.reserve ?? 0;
      const result = computeCableLength({
        routePoints: (c.branch_points as unknown as NormPoint[]) ?? [],
        manualRouteLengthM: null,
        calibration: planId ? calByPlan.get(planId) : null,
        reserveFromM: resolveReserve(c.from_endpoint_id as string | null, ctReserve),
        reserveToM: resolveReserve(c.to_endpoint_id as string | null, ctReserve),
        overrideCableLengthM: (c.override_length_m as number | null) ?? null,
      });
      if (result.meters == null) missing++;
      else totalMeters += result.meters;
      cableRows.push({
        id: c.id as string,
        code: c.code as string,
        status: c.status as string,
        typeCode: type?.code ?? "—",
        meters: result.meters,
        floorPlanId: planId,
        fromEndpointId: (c.from_endpoint_id as string | null) ?? null,
        fromEndpointCode: fromEp?.code ?? null,
        toEndpointId: (c.to_endpoint_id as string | null) ?? null,
        toEndpointCode: toEp?.code ?? null,
        branchPoints: (c.branch_points as unknown as NormPoint[]) ?? [],
        bundleId: (c.bundle_id as string | null) ?? null,
        notes: (c.notes as string | null) ?? null,
      });
    }

    type Spool = {
      index: number;
      typeCode: string;
      used: number;
      capacity: number;
      cables: Array<{ id: string; code: string; meters: number }>;
    };
    const byType = new Map<string, Array<{ id: string; code: string; meters: number }>>();
    for (const c of cableRows) {
      if (c.meters == null) continue;
      const arr = byType.get(c.typeCode) ?? [];
      arr.push({ id: c.id, code: c.code, meters: c.meters });
      byType.set(c.typeCode, arr);
    }
    const spools: Spool[] = [];
    for (const [typeCode, list] of byType) {
      list.sort((a, b) => b.meters - a.meters);
      let index = 1;
      const local: Spool[] = [];
      for (const cable of list) {
        if (cable.meters > spoolLen) {
          local.push({ index: index++, typeCode, used: cable.meters, capacity: cable.meters, cables: [cable] });
          continue;
        }
        const fit = local.find((s) => s.capacity === spoolLen && s.used + cable.meters <= spoolLen);
        if (fit) {
          fit.used += cable.meters;
          fit.cables.push(cable);
        } else {
          local.push({ index: index++, typeCode, used: cable.meters, capacity: spoolLen, cables: [cable] });
        }
      }
      spools.push(...local);
    }

    const hoursByType = Array.from(byType.entries()).map(([typeCode, list]) => {
      const meters = list.reduce((sum, cable) => sum + cable.meters, 0);
      const mph = Array.from(typeMap.values()).find((t) => t.code === typeCode)?.mph ?? null;
      return { typeCode, meters, hours: mph && mph > 0 ? meters / mph : null };
    });

    return {
      plans,
      endpoints: Array.from(endpointById.values()),
      bundles: (bundlesRes.data ?? []).map((b) => ({
        id: b.id as string,
        code: b.code as string,
        floorPlanId: b.floor_plan_id as string,
        points: (b.points as unknown as NormPoint[]) ?? [],
      })),
      patchPanels: (panelsRes.data ?? []).map((p) => ({
        id: p.id as string,
        code: p.code as string,
        name: (p.name as string | null) ?? null,
        floorPlanId: (p.floor_plan_id as string | null) ?? null,
        portCount: Number(p.port_count ?? 0),
      })),
      cables: cableRows,
      totalCables: cableRows.length,
      routedCables: cableRows.filter((c) => c.branchPoints.length >= 2).length,
      doneCables: cableRows.filter((c) => c.status === "PULLED").length,
      missing,
      totalMeters,
      spoolLengthM: spoolLen,
      spools: spools.map((s) => ({
        ...s,
        wasted: Math.max(0, s.capacity - s.used),
      })),
      hoursByType,
    };
  });

export const setCablePullStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cableId: z.string().uuid(),
        done: z.boolean(),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = { status: data.done ? "PULLED" : "PLANNED" };
    if (data.note?.trim()) {
      const { data: cable, error: readError } = await supabase
        .from("cables")
        .select("notes")
        .eq("id", data.cableId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const existing = (cable?.notes as string | null) ?? "";
      patch.notes = `${existing}${existing ? "\n" : ""}[${stamp}] ${data.note.trim()}`;
    }
    const { error } = await supabase.from("cables").update(patch as never).eq("id", data.cableId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
