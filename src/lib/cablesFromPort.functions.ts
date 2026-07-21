import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { closestPointOnPolyline, nearestBundle, normDistance, type NormPoint } from "@/lib/length";

// --- Clustering helpers -----------------------------------------------------

type Loc = { segIndex: number; t: number; point: NormPoint; arc: number };

function locateOnBundle(p: NormPoint, poly: NormPoint[]): Loc | null {
  if (poly.length < 2) return null;
  let best: { segIndex: number; t: number; point: NormPoint; d2: number } | null = null;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 0) {
      t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const point = { x: a.x + t * dx, y: a.y + t * dy };
    const ddx = p.x - point.x;
    const ddy = p.y - point.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (!best || d2 < best.d2) best = { segIndex: i - 1, t, point, d2 };
  }
  if (!best) return null;
  // cumulative arc-length up to the located point
  let arc = 0;
  for (let i = 0; i < best.segIndex; i++) arc += normDistance(poly[i], poly[i + 1]);
  arc += normDistance(poly[best.segIndex], best.point);
  return { segIndex: best.segIndex, t: best.t, point: best.point, arc };
}

function pointAtArc(poly: NormPoint[], target: number): NormPoint {
  if (poly.length < 2) return poly[0] ?? { x: 0, y: 0 };
  let remaining = Math.max(0, target);
  for (let i = 1; i < poly.length; i++) {
    const seg = normDistance(poly[i - 1], poly[i]);
    if (remaining <= seg || i === poly.length - 1) {
      const t = seg > 0 ? Math.min(1, remaining / seg) : 0;
      return {
        x: poly[i - 1].x + (poly[i].x - poly[i - 1].x) * t,
        y: poly[i - 1].y + (poly[i].y - poly[i - 1].y) * t,
      };
    }
    remaining -= seg;
  }
  return poly[poly.length - 1];
}

/** Distance threshold along a trunk within which endpoints share a spine. */
const CLUSTER_ARC_THRESHOLD = 0.06;
/** Max direct endpoint-to-endpoint distance to still be considered same cluster. */
const CLUSTER_DIRECT_THRESHOLD = 0.08;

type ClusterItem = {
  cableId: string;
  endpoint: NormPoint;
  epLoc: Loc;
  rack: NormPoint | null;
  rackLoc: Loc | null;
};

/** Group items sharing a trunk into arc-adjacent clusters and emit branch_points. */
function clusterItemsOnBundle(
  bundlePts: NormPoint[],
  items: ClusterItem[],
): Map<string, NormPoint[]> {
  const out = new Map<string, NormPoint[]>();
  if (items.length === 0) return out;
  const sorted = [...items].sort((a, b) => a.epLoc.arc - b.epLoc.arc);
  let cluster: ClusterItem[] = [];
  const flush = () => {
    if (cluster.length === 0) return;
    const arcs = cluster.map((c) => c.epLoc.arc);
    const midArc = (Math.min(...arcs) + Math.max(...arcs)) / 2;
    const spine = pointAtArc(bundlePts, midArc);
    const centroid = {
      x: cluster.reduce((s, c) => s + c.endpoint.x, 0) / cluster.length,
      y: cluster.reduce((s, c) => s + c.endpoint.y, 0) / cluster.length,
    };
    for (const it of cluster) {
      const branch: NormPoint[] = [];
      if (it.rack) {
        branch.push(it.rack);
        if (it.rackLoc) branch.push(it.rackLoc.point);
      }
      branch.push(spine);
      if (cluster.length > 1) branch.push(centroid);
      branch.push(it.endpoint);
      out.set(it.cableId, branch);
    }
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length === 0) {
      cluster.push(it);
      continue;
    }
    const last = cluster[cluster.length - 1];
    const arcOk = it.epLoc.arc - last.epLoc.arc <= CLUSTER_ARC_THRESHOLD;
    const directOk = normDistance(it.endpoint, last.endpoint) <= CLUSTER_DIRECT_THRESHOLD;
    if (arcOk && directOk) {
      cluster.push(it);
    } else {
      flush();
      cluster.push(it);
    }
  }
  flush();
  return out;
}



/**
 * Auto-assign every cable on a floor plan (that has a to_endpoint on this plan)
 * to the nearest cable_bundle on the same plan, computing straight-line
 * branch_points from the bundle anchor to the endpoint position.
 * Only touches cables that don't yet have a bundle_id.
 */
export const autoAssignBundlesForPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        floorPlanId: z.string().uuid(),
        overwrite: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: bundles } = await supabase
      .from("cable_bundles")
      .select("id, points")
      .eq("project_id", data.projectId)
      .eq("floor_plan_id", data.floorPlanId);
    const bundleList = (bundles ?? []).map((b) => ({
      id: b.id as string,
      points: (b.points as unknown as NormPoint[]) ?? [],
    }));
    if (bundleList.length === 0) {
      return { assigned: 0, skipped: 0, reason: "no_bundles" as const };
    }
    const { data: eps } = await supabase
      .from("endpoints")
      .select("id, norm_x, norm_y")
      .eq("project_id", data.projectId)
      .eq("floor_plan_id", data.floorPlanId);
    const epMap = new Map<string, NormPoint>();
    for (const e of eps ?? []) {
      epMap.set(e.id as string, { x: Number(e.norm_x), y: Number(e.norm_y) });
    }
    if (epMap.size === 0) return { assigned: 0, skipped: 0, reason: "no_endpoints" as const };

    // port -> rack position map (for prepending rack as trace origin)
    const { data: panels } = await supabase
      .from("patch_panels")
      .select("id, rack_id")
      .eq("project_id", data.projectId);
    const panelToRack = new Map<string, string>();
    for (const p of panels ?? []) {
      if (p.rack_id) panelToRack.set(p.id as string, p.rack_id as string);
    }
    const panelIds = (panels ?? []).map((p) => p.id as string);
    const portToRack = new Map<string, string>();
    if (panelIds.length > 0) {
      const { data: ports } = await supabase
        .from("patch_ports")
        .select("id, panel_id")
        .in("panel_id", panelIds);
      for (const p of ports ?? []) {
        const r = panelToRack.get(p.panel_id as string);
        if (r) portToRack.set(p.id as string, r);
      }
    }
    const { data: racks } = await supabase
      .from("racks")
      .select("id, x, y")
      .eq("project_id", data.projectId)
      .eq("floor_plan_id", data.floorPlanId);
    const rackPos = new Map<string, NormPoint>();
    for (const r of racks ?? []) {
      rackPos.set(r.id as string, { x: Number(r.x), y: Number(r.y) });
    }

    let query = supabase
      .from("cables")
      .select("id, bundle_id, to_endpoint_id, from_port_id")
      .eq("project_id", data.projectId)
      .in("to_endpoint_id", Array.from(epMap.keys()));
    if (!data.overwrite) query = query.is("bundle_id", null);
    const { data: cables, error } = await query;
    if (error) throw new Error(error.message);

    // Group cables by (bundle, rack) so cluster spines are shared.
    type Grouped = { bundlePts: NormPoint[]; items: ClusterItem[]; bundleId: string };
    const groups = new Map<string, Grouped>();
    let assigned = 0;
    let skipped = 0;

    for (const c of cables ?? []) {
      const epId = c.to_endpoint_id as string | null;
      if (!epId) { skipped++; continue; }
      const pos = epMap.get(epId);
      if (!pos) { skipped++; continue; }
      const nb = nearestBundle(pos, bundleList);
      if (!nb) { skipped++; continue; }
      const bundlePts = bundleList.find((b) => b.id === nb.id)!.points;
      const epLoc = locateOnBundle(pos, bundlePts);
      if (!epLoc) { skipped++; continue; }
      const portId = c.from_port_id as string | null;
      const rackId = portId ? portToRack.get(portId) : undefined;
      const rp = rackId ? rackPos.get(rackId) : undefined;
      const rackLoc = rp ? locateOnBundle(rp, bundlePts) : null;
      const key = `${nb.id}::${rackId ?? "none"}`;
      let g = groups.get(key);
      if (!g) {
        g = { bundlePts, items: [], bundleId: nb.id };
        groups.set(key, g);
      }
      g.items.push({
        cableId: c.id as string,
        endpoint: pos,
        epLoc,
        rack: rp ?? null,
        rackLoc,
      });
    }

    for (const g of groups.values()) {
      const branches = clusterItemsOnBundle(g.bundlePts, g.items);
      for (const it of g.items) {
        const branch = branches.get(it.cableId);
        if (!branch) continue;
        const { error: uerr } = await supabase
          .from("cables")
          .update({ bundle_id: g.bundleId, branch_points: branch } as never)
          .eq("id", it.cableId);
        if (uerr) throw new Error(uerr.message);
        assigned++;
      }
    }
    return { assigned, skipped, reason: "ok" as const };
  });


/**
 * Project-wide auto-assign: for every cable with a to_endpoint, pick the
 * nearest bundle on the same plan as that endpoint. Handles cross-plan
 * scenarios (rack on plan A, endpoints on plan B) — the rack prefix is
 * only added when the rack sits on the same plan as the endpoint.
 */
export const autoAssignBundlesForProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        overwrite: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: bundles }, { data: eps }, { data: racks }, { data: panels }] = await Promise.all(
      [
        supabase
          .from("cable_bundles")
          .select("id, floor_plan_id, points")
          .eq("project_id", data.projectId),
        supabase
          .from("endpoints")
          .select("id, floor_plan_id, norm_x, norm_y")
          .eq("project_id", data.projectId),
        supabase.from("racks").select("id, floor_plan_id, x, y").eq("project_id", data.projectId),
        supabase.from("patch_panels").select("id, rack_id").eq("project_id", data.projectId),
      ],
    );

    // bundles indexed by plan
    const bundlesByPlan = new Map<string, Array<{ id: string; points: NormPoint[] }>>();
    for (const b of bundles ?? []) {
      const plan = b.floor_plan_id as string;
      const arr = bundlesByPlan.get(plan) ?? [];
      arr.push({ id: b.id as string, points: (b.points as unknown as NormPoint[]) ?? [] });
      bundlesByPlan.set(plan, arr);
    }

    // endpoint id -> {plan, pos}
    const epInfo = new Map<string, { plan: string; pos: NormPoint }>();
    for (const e of eps ?? []) {
      if (!e.floor_plan_id) continue;
      epInfo.set(e.id as string, {
        plan: e.floor_plan_id as string,
        pos: { x: Number(e.norm_x), y: Number(e.norm_y) },
      });
    }

    // port -> rack
    const rackById = new Map<string, { plan: string; pos: NormPoint }>();
    for (const r of racks ?? []) {
      if (!r.floor_plan_id) continue;
      rackById.set(r.id as string, {
        plan: r.floor_plan_id as string,
        pos: { x: Number(r.x), y: Number(r.y) },
      });
    }
    const panelToRack = new Map<string, string>();
    for (const p of panels ?? []) {
      if (p.rack_id) panelToRack.set(p.id as string, p.rack_id as string);
    }
    const panelIds = (panels ?? []).map((p) => p.id as string);
    const portToRack = new Map<string, string>();
    if (panelIds.length > 0) {
      const { data: ports } = await supabase
        .from("patch_ports")
        .select("id, panel_id")
        .in("panel_id", panelIds);
      for (const p of ports ?? []) {
        const r = panelToRack.get(p.panel_id as string);
        if (r) portToRack.set(p.id as string, r);
      }
    }

    let query = supabase
      .from("cables")
      .select("id, bundle_id, to_endpoint_id, from_port_id")
      .eq("project_id", data.projectId)
      .not("to_endpoint_id", "is", null);
    if (!data.overwrite) query = query.is("bundle_id", null);
    const { data: cables, error } = await query;
    if (error) throw new Error(error.message);

    let assigned = 0;
    let skipped = 0;
    const missingBundlesOnPlans = new Set<string>();

    // Group by (plan, bundle, rack) to share a spine across nearby endpoints.
    type Grouped = { bundlePts: NormPoint[]; bundleId: string; items: ClusterItem[] };
    const groups = new Map<string, Grouped>();

    for (const c of cables ?? []) {
      const epId = c.to_endpoint_id as string | null;
      if (!epId) { skipped++; continue; }
      const ep = epInfo.get(epId);
      if (!ep) { skipped++; continue; }
      const bundleList = bundlesByPlan.get(ep.plan) ?? [];
      if (bundleList.length === 0) {
        missingBundlesOnPlans.add(ep.plan);
        skipped++;
        continue;
      }
      const nb = nearestBundle(ep.pos, bundleList);
      if (!nb) { skipped++; continue; }
      const bundlePts = bundleList.find((b) => b.id === nb.id)!.points;
      const epLoc = locateOnBundle(ep.pos, bundlePts);
      if (!epLoc) { skipped++; continue; }

      const portId = c.from_port_id as string | null;
      const rackId = portId ? portToRack.get(portId) : undefined;
      const rack = rackId ? rackById.get(rackId) : undefined;
      const rackSamePlan = rack && rack.plan === ep.plan ? rack.pos : null;
      const rackLoc = rackSamePlan ? locateOnBundle(rackSamePlan, bundlePts) : null;

      const key = `${ep.plan}::${nb.id}::${rackId ?? "none"}`;
      let g = groups.get(key);
      if (!g) {
        g = { bundlePts, bundleId: nb.id, items: [] };
        groups.set(key, g);
      }
      g.items.push({
        cableId: c.id as string,
        endpoint: ep.pos,
        epLoc,
        rack: rackSamePlan,
        rackLoc,
      });
    }

    for (const g of groups.values()) {
      const branches = clusterItemsOnBundle(g.bundlePts, g.items);
      for (const it of g.items) {
        const branch = branches.get(it.cableId);
        if (!branch) continue;
        const { error: uerr } = await supabase
          .from("cables")
          .update({ bundle_id: g.bundleId, branch_points: branch } as never)
          .eq("id", it.cableId);
        if (uerr) throw new Error(uerr.message);
        assigned++;
      }
    }


    return {
      assigned,
      skipped,
      missingBundlesOnPlans: Array.from(missingBundlesOnPlans),
      reason: (assigned === 0 && (bundles ?? []).length === 0 ? "no_bundles" : "ok") as
        | "ok"
        | "no_bundles",
    };
  });

/**
 * List cables belonging to a floor plan that have branch_points recorded,
 * plus their to_endpoint coords and bundle id — for rendering branches on the plan.
 */
export const listPlanBranches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), floorPlanId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: eps } = await supabase
      .from("endpoints")
      .select("id, norm_x, norm_y")
      .eq("project_id", data.projectId)
      .eq("floor_plan_id", data.floorPlanId);
    const epIds = (eps ?? []).map((e) => e.id as string);
    if (epIds.length === 0) return [];
    const { data: cables, error } = await supabase
      .from("cables")
      .select("id, code, bundle_id, branch_points, to_endpoint_id")
      .eq("project_id", data.projectId)
      .not("bundle_id", "is", null)
      .in("to_endpoint_id", epIds);
    if (error) throw new Error(error.message);
    return (cables ?? []).map((c) => ({
      id: c.id as string,
      code: c.code as string,
      bundleId: c.bundle_id as string,
      branchPoints: (c.branch_points as unknown as NormPoint[]) ?? [],
      toEndpointId: c.to_endpoint_id as string | null,
    }));
  });

/**
 * List patch ports that don't yet have a cable connected (i.e. free ports).
 * Grouped by rack → panel for the sidebar picker.
 */
export const listFreePorts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: panels } = await supabase
      .from("patch_panels")
      .select("id, code, name, rack_id, port_count")
      .eq("project_id", data.projectId)
      .order("code");
    const { data: racks } = await supabase
      .from("racks")
      .select("id, code, name")
      .eq("project_id", data.projectId)
      .order("code");
    const panelIds = (panels ?? []).map((p) => p.id);
    let ports: Array<{ id: string; panel_id: string; port_number: number; label: string | null }> =
      [];
    let usedPortIds = new Set<string>();
    if (panelIds.length > 0) {
      const [portsRes, cablesRes] = await Promise.all([
        supabase
          .from("patch_ports")
          .select("id, panel_id, port_number, label")
          .in("panel_id", panelIds)
          .order("port_number"),
        supabase
          .from("cables")
          .select("from_port_id")
          .eq("project_id", data.projectId)
          .not("from_port_id", "is", null),
      ]);
      ports = (portsRes.data ?? []) as typeof ports;
      usedPortIds = new Set(
        (cablesRes.data ?? [])
          .map((c) => c.from_port_id as string | null)
          .filter((v): v is string => !!v),
      );
    }
    const free = ports.filter((p) => !usedPortIds.has(p.id));
    return {
      racks: racks ?? [],
      panels: panels ?? [],
      freePorts: free,
    };
  });

/**
 * Create an endpoint at (x,y) and a cable connecting it to the given free patch port.
 * If bundles exist on the plan, auto-assigns the cable to the nearest one.
 */
export const createCableFromPort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        floorPlanId: z.string().uuid(),
        portId: z.string().uuid(),
        cableCode: z.string().min(1).max(80),
        endpoint: z.object({
          code: z.string().min(1).max(80),
          label: z.string().max(200).optional(),
          kind: z.enum(["WORKSTATION", "AP", "CAMERA", "PATCH", "OTHER"]).default("WORKSTATION"),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
        }),
        cableTypeId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Resolve organization
    const { data: proj, error: perr } = await supabase
      .from("projects")
      .select("organization_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (perr) throw new Error(perr.message);
    if (!proj) throw new Error("project not found");
    const organization_id = proj.organization_id as string;

    // Verify port is free
    const { data: portCable } = await supabase
      .from("cables")
      .select("id")
      .eq("from_port_id", data.portId)
      .maybeSingle();
    if (portCable) throw new Error("port už je obsazený");

    // Create endpoint
    const { data: epRow, error: eperr } = await supabase
      .from("endpoints")
      .insert({
        project_id: data.projectId,
        organization_id,
        floor_plan_id: data.floorPlanId,
        code: data.endpoint.code,
        label: data.endpoint.label ?? null,
        endpoint_kind: data.endpoint.kind,
        norm_x: data.endpoint.x,
        norm_y: data.endpoint.y,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (eperr) throw new Error(eperr.message);
    const endpointId = (epRow as { id: string }).id;

    // Nearest bundle on this plan
    const { data: bundles } = await supabase
      .from("cable_bundles")
      .select("id, points")
      .eq("project_id", data.projectId)
      .eq("floor_plan_id", data.floorPlanId);
    const bundleList = (bundles ?? []).map((b) => ({
      id: b.id as string,
      points: (b.points as unknown as NormPoint[]) ?? [],
    }));
    const epPos: NormPoint = { x: data.endpoint.x, y: data.endpoint.y };
    const nearest = nearestBundle(epPos, bundleList);

    // Resolve rack position for the port (start of the trace)
    const { data: portRow } = await supabase
      .from("patch_ports")
      .select("panel_id")
      .eq("id", data.portId)
      .maybeSingle();
    let rackPoint: NormPoint | null = null;
    if (portRow?.panel_id) {
      const { data: panelRow } = await supabase
        .from("patch_panels")
        .select("rack_id")
        .eq("id", portRow.panel_id as string)
        .maybeSingle();
      if (panelRow?.rack_id) {
        const { data: rackRow } = await supabase
          .from("racks")
          .select("x, y, floor_plan_id")
          .eq("id", panelRow.rack_id as string)
          .maybeSingle();
        if (rackRow && rackRow.floor_plan_id === data.floorPlanId) {
          rackPoint = { x: Number(rackRow.x), y: Number(rackRow.y) };
        }
      }
    }

    let branch: NormPoint[] | null = null;
    if (nearest) {
      const bundlePts = bundleList.find((b) => b.id === nearest.id)!.points;
      const anchorEp = closestPointOnPolyline(epPos, bundlePts);
      const arr: NormPoint[] = [];
      if (rackPoint) {
        arr.push(rackPoint);
        const anchorRack = closestPointOnPolyline(rackPoint, bundlePts);
        if (anchorRack) arr.push(anchorRack.point);
      }
      if (anchorEp) arr.push(anchorEp.point);
      arr.push(epPos);
      branch = arr;
    } else if (rackPoint) {
      branch = [rackPoint, epPos];
    }

    // Create cable
    const { data: cabRow, error: cerr } = await supabase
      .from("cables")
      .insert({
        project_id: data.projectId,
        organization_id,
        code: data.cableCode,
        cable_type_id: data.cableTypeId ?? null,
        from_port_id: data.portId,
        to_endpoint_id: endpointId,
        bundle_id: nearest?.id ?? null,
        branch_points: branch,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (cerr) throw new Error(cerr.message);

    return {
      cableId: (cabRow as { id: string }).id,
      endpointId,
      bundleId: nearest?.id ?? null,
    };
  });
