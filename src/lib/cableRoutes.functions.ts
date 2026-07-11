import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateInput = z.object({
  projectId: z.string().uuid(),
  floorPlanId: z.string().uuid(),
  name: z.string().max(200).optional(),
  fromEndpointId: z.string().uuid().nullable().optional(),
  toEndpointId: z.string().uuid().nullable().optional(),
  rackEndpointId: z.string().uuid().nullable().optional(),
  manualLengthM: z.number().min(0).nullable().optional(),
});

const UpdatePointsInput = z.object({
  routeId: z.string().uuid(),
  points: z
    .array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
      }),
    )
    .max(500),
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

export const listRoutes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        floorPlanId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("cable_routes")
      .select(
        "id, name, floor_plan_id, from_endpoint_id, to_endpoint_id, rack_endpoint_id, manual_length_m, updated_at",
      )
      .eq("project_id", data.projectId);
    if (data.floorPlanId) q = q.eq("floor_plan_id", data.floorPlanId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getRouteWithPoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("cable_routes")
      .select(
        "id, project_id, floor_plan_id, name, from_endpoint_id, to_endpoint_id, manual_length_m",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("route not found");
    const { data: points, error: perr } = await supabase
      .from("cable_route_points")
      .select("id, sequence, norm_x, norm_y")
      .eq("route_id", data.id)
      .order("sequence", { ascending: true });
    if (perr) throw new Error(perr.message);
    return { route: row, points: points ?? [] };
  });

export const createRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const organization_id = await orgFor(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("cable_routes")
      .insert({
        project_id: data.projectId,
        organization_id,
        floor_plan_id: data.floorPlanId,
        name: data.name ?? null,
        from_endpoint_id: data.fromEndpointId ?? data.rackEndpointId ?? null,
        to_endpoint_id: data.toEndpointId ?? null,
        rack_endpoint_id: data.rackEndpointId ?? null,
        manual_length_m: data.manualLengthM ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().max(200).nullable().optional(),
        fromEndpointId: z.string().uuid().nullable().optional(),
        toEndpointId: z.string().uuid().nullable().optional(),
        rackEndpointId: z.string().uuid().nullable().optional(),
        manualLengthM: z.number().min(0).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.fromEndpointId !== undefined) patch.from_endpoint_id = data.fromEndpointId;
    if (data.toEndpointId !== undefined) patch.to_endpoint_id = data.toEndpointId;
    if (data.rackEndpointId !== undefined) patch.rack_endpoint_id = data.rackEndpointId;
    if (data.manualLengthM !== undefined) patch.manual_length_m = data.manualLengthM;
    const { error } = await supabase
      .from("cable_routes")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateRoutePoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdatePointsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: r, error: rerr } = await supabase
      .from("cable_routes")
      .select("project_id, floor_plan_id")
      .eq("id", data.routeId)
      .maybeSingle();
    if (rerr) throw new Error(rerr.message);
    if (!r) throw new Error("route not found");
    const { error: derr } = await supabase
      .from("cable_route_points")
      .delete()
      .eq("route_id", data.routeId);
    if (derr) throw new Error(derr.message);
    if (data.points.length === 0) return { ok: true };
    const payload = data.points.map((p, i) => ({
      route_id: data.routeId,
      project_id: r.project_id,
      floor_plan_id: r.floor_plan_id,
      sequence: i,
      norm_x: p.x,
      norm_y: p.y,
    }));
    const { error } = await supabase.from("cable_route_points").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("cable_routes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
