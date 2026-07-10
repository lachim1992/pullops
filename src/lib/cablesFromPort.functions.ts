import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nearestBundle, type NormPoint } from "@/lib/length";

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
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(d),
  )
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
    let ports: Array<{ id: string; panel_id: string; port_number: number; label: string | null }> = [];
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
    const nearest = nearestBundle(
      { x: data.endpoint.x, y: data.endpoint.y },
      bundleList,
    );

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
        branch_points: nearest
          ? [nearest.anchor, { x: data.endpoint.x, y: data.endpoint.y }]
          : null,
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
