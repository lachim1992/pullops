import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeCableLength, type Calibration, type NormPoint } from "@/lib/length";

const uuid = z.string().uuid();

type Reason = { key: string; detail?: string };

type ProposedAssignment = {
  cableId: string;
  cableCode: string;
  cableTypeCode: string;
  meters: number;
  dayPlanId: string | null;
  dayPlanName: string | null;
  spoolId: string | null;
  spoolSerial: string | null;
  sequenceNumber: number;
  optimizerScore: number;
  reasons: Reason[];
};

type OptimizerResult = {
  proposals: ProposedAssignment[];
  skipped: Array<{ cableId: string; cableCode: string; reason: string }>;
  summary: {
    totalCables: number;
    assigned: number;
    skipped: number;
    blocksUsed: number;
    spoolsUsed: number;
    wastedMeters: number;
  };
};

/** Run the pull-order optimizer. `mode: 'preview'` returns proposals only. `mode: 'apply'` writes pull_assignments + day-plan assignments. */
export const runOptimizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        mode: z.enum(["preview", "apply"]).default("preview"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<OptimizerResult> => {
    const { supabase, userId } = context;

    const [cablesRes, typesRes, endpointsRes, kindsRes, calsRes, dayPlansRes, spoolsRes] =
      await Promise.all([
        supabase
          .from("cables")
          .select(
            "id, code, cable_type_id, override_length_m, branch_points, from_endpoint_id, to_endpoint_id",
          )
          .eq("project_id", data.projectId),
        supabase
          .from("cable_types")
          .select("id, code, default_reserve_m")
          .eq("project_id", data.projectId),
        supabase
          .from("endpoints")
          .select("id, floor_plan_id, endpoint_kind")
          .eq("project_id", data.projectId),
        supabase
          .from("endpoint_kinds")
          .select("code, default_reserve_m")
          .eq("project_id", data.projectId),
        supabase
          .from("floor_plan_calibrations")
          .select(
            "floor_plan_id, point_a_norm_x, point_a_norm_y, point_b_norm_x, point_b_norm_y, real_distance_m",
          )
          .eq("project_id", data.projectId),
        supabase
          .from("pull_day_plans")
          .select("id, name, sort_order, spool_count, spool_length_m")
          .eq("project_id", data.projectId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("spools")
          .select("id, serial_no, cable_type_id, current_length_m, status")
          .eq("project_id", data.projectId)
          .in("status", ["WAREHOUSE", "ON_STATION"]),
      ]);

    for (const r of [cablesRes, typesRes, endpointsRes, kindsRes, calsRes, dayPlansRes, spoolsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    // Length engine bookkeeping
    const calByPlan = new Map<string, Calibration>();
    for (const c of calsRes.data ?? []) {
      calByPlan.set(c.floor_plan_id as string, {
        a: { x: Number(c.point_a_norm_x), y: Number(c.point_a_norm_y) },
        b: { x: Number(c.point_b_norm_x), y: Number(c.point_b_norm_y) },
        real_distance_m: Number(c.real_distance_m),
      });
    }
    const epPlan = new Map<string, string>();
    const epKind = new Map<string, string>();
    for (const e of endpointsRes.data ?? []) {
      if (e.floor_plan_id) epPlan.set(e.id as string, e.floor_plan_id as string);
      if (e.endpoint_kind) epKind.set(e.id as string, e.endpoint_kind as string);
    }
    const reserveByKind = new Map<string, number>();
    for (const k of kindsRes.data ?? []) {
      reserveByKind.set(k.code as string, Number(k.default_reserve_m ?? 0));
    }
    const typeMap = new Map<string, { code: string; reserve: number }>();
    for (const t of typesRes.data ?? []) {
      typeMap.set(t.id as string, {
        code: (t.code as string) ?? "—",
        reserve: Number(t.default_reserve_m ?? 0),
      });
    }
    const resolveReserve = (epId: string | null | undefined, fb: number) => {
      if (!epId) return fb;
      const k = epKind.get(epId);
      if (!k) return fb;
      const r = reserveByKind.get(k);
      return r != null ? r : fb;
    };

    type CableRow = {
      id: string;
      code: string;
      typeId: string | null;
      typeCode: string;
      meters: number;
    };
    const cables: CableRow[] = [];
    const skipped: OptimizerResult["skipped"] = [];
    for (const c of cablesRes.data ?? []) {
      const t = c.cable_type_id ? typeMap.get(c.cable_type_id as string) : undefined;
      const ctReserve = t?.reserve ?? 0;
      const toEp = c.to_endpoint_id as string | null;
      const fp = toEp ? epPlan.get(toEp) : undefined;
      const cal = fp ? calByPlan.get(fp) : undefined;
      const r = computeCableLength({
        routePoints: (c.branch_points as unknown as NormPoint[]) ?? [],
        manualRouteLengthM: null,
        calibration: cal ?? null,
        reserveFromM: resolveReserve(c.from_endpoint_id as string | null, ctReserve),
        reserveToM: resolveReserve(c.to_endpoint_id as string | null, ctReserve),
        overrideCableLengthM: (c.override_length_m as number | null) ?? null,
      });
      if (r.meters == null) {
        skipped.push({
          id: c.id as string,
          cableId: c.id as string,
          cableCode: c.code as string,
          reason: "Neznámé metry (chybí trasa nebo kalibrace)",
        } as never);
        continue;
      }
      cables.push({
        id: c.id as string,
        code: c.code as string,
        typeId: (c.cable_type_id as string | null) ?? null,
        typeCode: t?.code ?? "—",
        meters: r.meters,
      });
    }

    // FFD per type into day-plan capacity buckets
    type PlanState = {
      id: string;
      name: string;
      sortOrder: number;
      remainingMeters: number;
      spoolsAvailable: number;
      spoolLength: number;
      typeUsage: Map<string, number>;
      assigned: CableRow[];
    };
    const plans: PlanState[] = (dayPlansRes.data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      sortOrder: Number(p.sort_order ?? 0),
      remainingMeters: Number(p.spool_count ?? 3) * Number(p.spool_length_m ?? 305),
      spoolsAvailable: Number(p.spool_count ?? 3),
      spoolLength: Number(p.spool_length_m ?? 305),
      typeUsage: new Map(),
      assigned: [],
    }));

    // Physical spool inventory pool per cable_type
    type SpoolState = {
      id: string;
      serial: string;
      cableTypeId: string | null;
      remaining: number;
    };
    const spoolPool: SpoolState[] = (spoolsRes.data ?? []).map((s) => ({
      id: s.id as string,
      serial: s.serial_no as string,
      cableTypeId: (s.cable_type_id as string | null) ?? null,
      remaining: Number(s.current_length_m),
    }));

    // Sort cables biggest first for FFD
    cables.sort((a, b) => b.meters - a.meters);

    const proposals: ProposedAssignment[] = [];
    let wastedMeters = 0;

    for (const cable of cables) {
      const reasons: Reason[] = [];
      // Find first plan with capacity
      let target: PlanState | null = null;
      for (const p of plans) {
        if (cable.meters <= p.remainingMeters && cable.meters <= p.spoolLength) {
          target = p;
          break;
        }
      }
      if (!target) {
        if (plans.length === 0) {
          skipped.push({
            cableId: cable.id,
            cableCode: cable.code,
            reason: "Není definován žádný denní blok",
          });
        } else {
          skipped.push({
            cableId: cable.id,
            cableCode: cable.code,
            reason: `Kabel (${cable.meters.toFixed(1)} m) se nevejde do žádného denního bloku`,
          });
        }
        continue;
      }

      target.assigned.push(cable);
      target.remainingMeters -= cable.meters;
      target.typeUsage.set(cable.typeCode, (target.typeUsage.get(cable.typeCode) ?? 0) + cable.meters);
      reasons.push({ key: "block_fit", detail: `Zbývá ${target.remainingMeters.toFixed(1)} m` });

      // Pick a physical spool (best-fit: smallest remaining that still fits)
      let spool: SpoolState | null = null;
      const candidates = spoolPool
        .filter((s) => s.remaining >= cable.meters && (s.cableTypeId == null || s.cableTypeId === cable.typeId))
        .sort((a, b) => a.remaining - b.remaining);
      if (candidates.length > 0) {
        spool = candidates[0];
        spool.remaining -= cable.meters;
        reasons.push({ key: "spool_match", detail: `Spulka ${spool.serial}` });
      } else {
        reasons.push({ key: "spool_none", detail: "Žádná vhodná fyzická spulka" });
      }

      // Score: 100 - percentage waste of the fit
      const score = Math.max(0, 100 - (cable.meters / target.spoolLength) * 3);

      proposals.push({
        cableId: cable.id,
        cableCode: cable.code,
        cableTypeCode: cable.typeCode,
        meters: cable.meters,
        dayPlanId: target.id,
        dayPlanName: target.name,
        spoolId: spool?.id ?? null,
        spoolSerial: spool?.serial ?? null,
        sequenceNumber: target.assigned.length, // 1-based within block
        optimizerScore: Number(score.toFixed(2)),
        reasons,
      });
    }

    for (const p of plans) {
      wastedMeters += Math.max(0, p.remainingMeters);
    }

    const summary = {
      totalCables: cables.length,
      assigned: proposals.length,
      skipped: skipped.length,
      blocksUsed: plans.filter((p) => p.assigned.length > 0).length,
      spoolsUsed: new Set(proposals.map((pr) => pr.spoolId).filter(Boolean)).size,
      wastedMeters: Number(wastedMeters.toFixed(1)),
    };

    if (data.mode === "apply" && proposals.length > 0) {
      // Get project org for organization_id fill (trigger fills it, but supply for safety)
      const { data: proj, error: projErr } = await supabase
        .from("projects")
        .select("organization_id")
        .eq("id", data.projectId)
        .single();
      if (projErr) throw new Error(projErr.message);
      const orgId = proj!.organization_id as string;

      // Clear existing planned/active assignments for these cables so re-runs are idempotent
      const cableIds = proposals.map((p) => p.cableId);
      const del = await supabase
        .from("pull_assignments")
        .delete()
        .eq("project_id", data.projectId)
        .in("cable_id", cableIds)
        .in("status", ["PLANNED", "ACTIVE"]);
      if (del.error) throw new Error(del.error.message);

      // Insert new assignments
      const rows = proposals.map((p) => ({
        project_id: data.projectId,
        organization_id: orgId,
        cable_id: p.cableId,
        spool_id: p.spoolId,
        day_plan_id: p.dayPlanId,
        status: "PLANNED" as const,
        planned_meters: p.meters,
        sequence_number: p.sequenceNumber,
        optimizer_score: p.optimizerScore,
        optimizer_reasons: p.reasons as never,
        assigned_at: new Date().toISOString(),
        created_by: userId,
      }));
      const ins = await supabase.from("pull_assignments").insert(rows as never);
      if (ins.error) throw new Error(ins.error.message);

      // Sync pull_day_plan_cables from proposals
      const delAssign = await supabase
        .from("pull_day_plan_cables")
        .delete()
        .eq("project_id", data.projectId)
        .in("cable_id", cableIds);
      if (delAssign.error) throw new Error(delAssign.error.message);
      const assignRows = proposals
        .filter((p) => p.dayPlanId)
        .map((p) => ({
          project_id: data.projectId,
          day_plan_id: p.dayPlanId!,
          cable_id: p.cableId,
          sort_order: p.sequenceNumber,
        }));
      if (assignRows.length > 0) {
        const insAssign = await supabase
          .from("pull_day_plan_cables")
          .insert(assignRows as never);
        if (insAssign.error) throw new Error(insAssign.error.message);
      }
    }

    return { proposals, skipped, summary };
  });
