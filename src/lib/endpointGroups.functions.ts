import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listEndpointCables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ endpointId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("endpoint_cable_groups")
      .select(
        "id, sequence, notes, cable:cables(id, code, status, cable_type_id, route_id, computed_length_m)",
      )
      .eq("endpoint_id", data.endpointId)
      .order("sequence", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listUnassignedCables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: assigned, error: aerr } = await supabase
      .from("endpoint_cable_groups")
      .select("cable_id")
      .eq("project_id", data.projectId);
    if (aerr) throw new Error(aerr.message);
    const assignedIds = new Set((assigned ?? []).map((r) => r.cable_id));
    const { data: rows, error } = await supabase
      .from("cables")
      .select("id, code, status, cable_type_id")
      .eq("project_id", data.projectId)
      .order("code");
    if (error) throw new Error(error.message);
    return (rows ?? []).filter((c) => !assignedIds.has(c.id));
  });

export const addCablesToEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        endpointId: z.string().uuid(),
        cableIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: existing } = await supabase
      .from("endpoint_cable_groups")
      .select("sequence")
      .eq("endpoint_id", data.endpointId)
      .order("sequence", { ascending: false })
      .limit(1);
    let seq = (existing?.[0]?.sequence ?? -1) + 1;
    const payload = data.cableIds.map((cid) => ({
      project_id: data.projectId,
      endpoint_id: data.endpointId,
      cable_id: cid,
      sequence: seq++,
    }));
    const { error } = await supabase.from("endpoint_cable_groups").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeCableFromEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ endpointId: z.string().uuid(), cableId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("endpoint_cable_groups")
      .delete()
      .eq("endpoint_id", data.endpointId)
      .eq("cable_id", data.cableId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderEndpointCables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        endpointId: z.string().uuid(),
        orderedCableIds: z.array(z.string().uuid()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    for (let i = 0; i < data.orderedCableIds.length; i++) {
      const { error } = await supabase
        .from("endpoint_cable_groups")
        .update({ sequence: i })
        .eq("endpoint_id", data.endpointId)
        .eq("cable_id", data.orderedCableIds[i]);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const assignRouteToEndpointCables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ endpointId: z.string().uuid(), routeId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: group, error: gerr } = await supabase
      .from("endpoint_cable_groups")
      .select("cable_id")
      .eq("endpoint_id", data.endpointId);
    if (gerr) throw new Error(gerr.message);
    const ids = (group ?? []).map((g) => g.cable_id);
    if (ids.length === 0) return { ok: true, count: 0 };
    const { error } = await supabase
      .from("cables")
      .update({ route_id: data.routeId })
      .in("id", ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: ids.length };
  });
