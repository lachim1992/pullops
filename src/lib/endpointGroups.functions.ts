import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recomputeCablesByIds } from "@/lib/cables.functions";
import { dbErrorMessage } from "@/lib/dbErrors";

export const listEndpointCables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ endpointId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("endpoint_cable_groups")
      .select(
        "id, sequence, notes, cable:cables(id, code, status, cable_type_id, route_id, computed_length_m)",
      )
      .eq("endpoint_id", data.endpointId)
      .order("sequence", { ascending: true });
    if (error) throw new Error(dbErrorMessage(error));
    return rows ?? [];
  });

export const listUnassignedCables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: assigned, error: aerr } = await supabase
      .from("endpoint_cable_groups")
      .select("cable_id")
      .eq("project_id", data.projectId);
    if (aerr) throw new Error(dbErrorMessage(aerr));
    const assignedIds = new Set((assigned ?? []).map((r) => r.cable_id));
    const { data: rows, error } = await supabase
      .from("cables")
      .select("id, code, status, cable_type_id")
      .eq("project_id", data.projectId)
      .order("code");
    if (error) throw new Error(dbErrorMessage(error));
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
    const { data: endpoint, error: endpointError } = await supabase
      .from("endpoints")
      .select("id, project_id")
      .eq("id", data.endpointId)
      .maybeSingle();
    if (endpointError) throw new Error(dbErrorMessage(endpointError));
    if (!endpoint || endpoint.project_id !== data.projectId) {
      throw new Error("endpoint nepatří do projektu");
    }

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
    if (error) throw new Error(dbErrorMessage(error));

    const { error: cableError } = await supabase
      .from("cables")
      .update({
        to_endpoint_id: data.endpointId,
        route_id: null,
        bundle_id: null,
        branch_points: null,
      } as never)
      .eq("project_id", data.projectId)
      .in("id", data.cableIds);
    if (cableError) throw new Error(dbErrorMessage(cableError));

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
    if (error) throw new Error(dbErrorMessage(error));

    const { data: remaining, error: remainingError } = await supabase
      .from("endpoint_cable_groups")
      .select("endpoint_id")
      .eq("cable_id", data.cableId)
      .limit(1);
    if (remainingError) throw new Error(dbErrorMessage(remainingError));

    const nextEndpointId = remaining?.[0]?.endpoint_id ?? null;
    const { error: cableError } = await supabase
      .from("cables")
      .update({
        to_endpoint_id: nextEndpointId,
        route_id: null,
        bundle_id: null,
        branch_points: null,
      } as never)
      .eq("id", data.cableId);
    if (cableError) throw new Error(dbErrorMessage(cableError));

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
      if (error) throw new Error(dbErrorMessage(error));
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
    if (gerr) throw new Error(dbErrorMessage(gerr));
    const ids = (group ?? []).map((g) => g.cable_id);
    if (ids.length === 0) return { ok: true, count: 0 };
    const { error } = await supabase
      .from("cables")
      .update({ route_id: data.routeId })
      .in("id", ids);
    if (error) throw new Error(dbErrorMessage(error));
    await recomputeCablesByIds(supabase, ids as string[]);
    return { ok: true, count: ids.length };
  });
