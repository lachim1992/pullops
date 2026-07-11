import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbErrorMessage } from "@/lib/dbErrors";

const CreateInput = z.object({
  projectId: z.string().uuid(),
  code: z.string().min(1).max(80),
  name: z.string().max(200).optional(),
  portCount: z.number().int().min(1).max(288),
  floorPlanId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(80).optional(),
  name: z.string().max(200).nullable().optional(),
  floorPlanId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const UpdatePortInput = z.object({
  id: z.string().uuid(),
  label: z.string().max(200).nullable().optional(),
});

async function orgFor(supabase: any, projectId: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(dbErrorMessage(error));
  if (!data) throw new Error("project not found");
  return data.organization_id as string;
}

export const listPatchPanels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("patch_panels")
      .select("id, code, name, port_count, floor_plan_id, rack_id, notes, updated_at")
      .eq("project_id", data.projectId)
      .order("code");
    if (error) throw new Error(dbErrorMessage(error));
    return rows ?? [];
  });

export const getPatchPanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: panel, error } = await supabase
      .from("patch_panels")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(dbErrorMessage(error));
    if (!panel) throw new Error("panel not found");
    const { data: ports, error: err2 } = await supabase
      .from("patch_ports")
      .select("id, port_number, label")
      .eq("panel_id", data.id)
      .order("port_number");
    if (err2) throw new Error(err2.message);
    const portIds = (ports ?? []).map((p) => p.id);
    const cablesByPort: Record<
      string,
      { id: string; code: string; status: string; to_endpoint_id: string | null }
    > = {};
    if (portIds.length > 0) {
      const { data: cables } = await supabase
        .from("cables")
        .select("id, code, status, from_port_id, to_endpoint_id")
        .in("from_port_id", portIds);
      for (const c of cables ?? []) {
        if (c.from_port_id)
          cablesByPort[c.from_port_id] = {
            id: c.id,
            code: c.code,
            status: c.status,
            to_endpoint_id: c.to_endpoint_id,
          };
      }
    }
    return {
      panel,
      ports: (ports ?? []).map((p) => ({ ...p, cable: cablesByPort[p.id] ?? null })),
    };
  });

export const createPatchPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const organization_id = await orgFor(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("patch_panels")
      .insert({
        project_id: data.projectId,
        organization_id,
        code: data.code,
        name: data.name ?? null,
        port_count: data.portCount,
        floor_plan_id: data.floorPlanId ?? null,
        notes: data.notes ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(dbErrorMessage(error));
    return { id: row.id as string };
  });

export const updatePatchPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.code !== undefined) patch.code = data.code;
    if (data.name !== undefined) patch.name = data.name;
    if (data.floorPlanId !== undefined) patch.floor_plan_id = data.floorPlanId;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { error } = await supabase
      .from("patch_panels")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

export const deletePatchPanel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("patch_panels").delete().eq("id", data.id);
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

export const updatePatchPort = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdatePortInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.label !== undefined) patch.label = data.label;
    const { error } = await supabase
      .from("patch_ports")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

export const listProjectPatchPorts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("patch_ports")
      .select("id, panel_id, port_number, label, patch_panels!inner(code, project_id)")
      .eq("patch_panels.project_id", data.projectId)
      .order("port_number");
    if (error) throw new Error(dbErrorMessage(error));
    return (rows ?? []) as Array<{
      id: string;
      panel_id: string;
      port_number: number;
      label: string | null;
      patch_panels: { code: string; project_id: string };
    }>;
  });
