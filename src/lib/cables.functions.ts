import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeCableLength, type NormPoint } from "@/lib/length";

const CableStatus = z.enum(["PLANNED", "PULLED", "TERMINATED", "TESTED", "CANCELLED"]);

const CreateInput = z.object({
  projectId: z.string().uuid(),
  code: z.string().min(1).max(80),
  cableTypeId: z.string().uuid().nullable().optional(),
  routeId: z.string().uuid().nullable().optional(),
  fromEndpointId: z.string().uuid().nullable().optional(),
  toEndpointId: z.string().uuid().nullable().optional(),
  fromPortId: z.string().uuid().nullable().optional(),
  toPortId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(80).optional(),
  cableTypeId: z.string().uuid().nullable().optional(),
  routeId: z.string().uuid().nullable().optional(),
  fromEndpointId: z.string().uuid().nullable().optional(),
  toEndpointId: z.string().uuid().nullable().optional(),
  fromPortId: z.string().uuid().nullable().optional(),
  toPortId: z.string().uuid().nullable().optional(),
  status: CableStatus.optional(),
  overrideLengthM: z.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});


async function orgFor(supabase: any, projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("project not found");
  return data.organization_id as string;
}

export const listCables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("cables")
      .select(
        "id, code, status, cable_type_id, route_id, from_endpoint_id, to_endpoint_id, computed_length_m, override_length_m, notes, updated_at",
      )
      .eq("project_id", data.projectId)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getCable = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("cables")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const createCable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const organization_id = await orgFor(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("cables")
      .insert({
        project_id: data.projectId,
        organization_id,
        code: data.code,
        cable_type_id: data.cableTypeId ?? null,
        route_id: data.routeId ?? null,
        from_endpoint_id: data.fromEndpointId ?? null,
        to_endpoint_id: data.toEndpointId ?? null,
        from_port_id: data.fromPortId ?? null,
        to_port_id: data.toPortId ?? null,
        notes: data.notes ?? null,
        created_by: userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateCable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.code !== undefined) patch.code = data.code;
    if (data.cableTypeId !== undefined) patch.cable_type_id = data.cableTypeId;
    if (data.routeId !== undefined) patch.route_id = data.routeId;
    if (data.fromEndpointId !== undefined) patch.from_endpoint_id = data.fromEndpointId;
    if (data.toEndpointId !== undefined) patch.to_endpoint_id = data.toEndpointId;
    if (data.fromPortId !== undefined) patch.from_port_id = data.fromPortId;
    if (data.toPortId !== undefined) patch.to_port_id = data.toPortId;
    if (data.status !== undefined) patch.status = data.status;
    if (data.overrideLengthM !== undefined) patch.override_length_m = data.overrideLengthM;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabase.from("cables").update(patch as never).eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("cables").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function resolveEndpointReserve(
  supabase: any,
  endpointId: string | null | undefined,
  cableTypeReserve: number,
): Promise<number> {
  if (!endpointId) return cableTypeReserve;
  const { data: ep } = await supabase
    .from("endpoints")
    .select("project_id, endpoint_kind")
    .eq("id", endpointId)
    .maybeSingle();
  if (!ep?.endpoint_kind || !ep.project_id) return cableTypeReserve;
  const { data: kind } = await supabase
    .from("endpoint_kinds")
    .select("default_reserve_m")
    .eq("project_id", ep.project_id)
    .eq("code", ep.endpoint_kind)
    .maybeSingle();
  if (kind?.default_reserve_m != null) return Number(kind.default_reserve_m);
  return cableTypeReserve;
}

async function recomputeOne(supabase: any, cable: any): Promise<number | null> {
  let cableTypeReserve = 0;
  if (cable.cable_type_id) {
    const { data: ct } = await supabase
      .from("cable_types")
      .select("default_reserve_m")
      .eq("id", cable.cable_type_id)
      .maybeSingle();
    cableTypeReserve = Number(ct?.default_reserve_m ?? 0);
  }

  // Per-side reserves (endpoint kind overrides cable-type reserve)
  const [reserveFromM, reserveToM] = await Promise.all([
    resolveEndpointReserve(supabase, cable.from_endpoint_id, cableTypeReserve),
    resolveEndpointReserve(supabase, cable.to_endpoint_id, cableTypeReserve),
  ]);

  let manualRouteLengthM: number | null = null;
  let routePoints: NormPoint[] = [];
  let calibration: any = null;

  if (cable.route_id) {
    const { data: r } = await supabase
      .from("cable_routes")
      .select("manual_length_m, floor_plan_id")
      .eq("id", cable.route_id)
      .maybeSingle();
    manualRouteLengthM = r?.manual_length_m ?? null;
    if (r?.floor_plan_id) {
      const [{ data: pts }, { data: cal }] = await Promise.all([
        supabase
          .from("cable_route_points")
          .select("norm_x, norm_y, sequence")
          .eq("route_id", cable.route_id)
          .order("sequence"),
        supabase
          .from("floor_plan_calibrations")
          .select("point_a_norm_x, point_a_norm_y, point_b_norm_x, point_b_norm_y, real_distance_m")
          .eq("floor_plan_id", r.floor_plan_id)
          .maybeSingle(),
      ]);
      routePoints = (pts ?? []).map((p: any) => ({ x: Number(p.norm_x), y: Number(p.norm_y) }));
      if (cal) {
        calibration = {
          a: { x: Number(cal.point_a_norm_x), y: Number(cal.point_a_norm_y) },
          b: { x: Number(cal.point_b_norm_x), y: Number(cal.point_b_norm_y) },
          real_distance_m: Number(cal.real_distance_m),
        };
      }
    }
  }

  const result = computeCableLength({
    routePoints,
    manualRouteLengthM,
    calibration,
    reserveFromM,
    reserveToM,
    overrideCableLengthM: cable.override_length_m,
  });

  await supabase
    .from("cables")
    .update({ computed_length_m: result.meters })
    .eq("id", cable.id);
  return result.meters;
}

export const recomputeCableLength = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cableId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cable, error } = await supabase
      .from("cables")
      .select("id, cable_type_id, route_id, override_length_m, from_endpoint_id, to_endpoint_id")
      .eq("id", data.cableId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!cable) throw new Error("cable not found");
    const meters = await recomputeOne(supabase, cable);
    return { meters };
  });

export const recomputeProjectLengths = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: cables, error } = await supabase
      .from("cables")
      .select("id, cable_type_id, route_id, override_length_m, from_endpoint_id, to_endpoint_id")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    let count = 0;
    for (const c of cables ?? []) {
      await recomputeOne(supabase, c);
      count++;
    }
    return { count };
  });
