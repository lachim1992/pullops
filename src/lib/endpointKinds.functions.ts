import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateInput = z.object({
  projectId: z.string().uuid(),
  code: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_]+$/, "Kód: velká písmena, číslice, podtržítko"),
  label: z.string().min(1).max(80),
  defaultReserveM: z.number().min(0).max(50),
  color: z.string().max(64).optional(),
  icon: z.string().max(40).optional(),
  sortOrder: z.number().int().optional(),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(80).optional(),
  defaultReserveM: z.number().min(0).max(50).optional(),
  color: z.string().max(64).nullable().optional(),
  icon: z.string().max(40).nullable().optional(),
  sortOrder: z.number().int().optional(),
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

export const listEndpointKinds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("endpoint_kinds")
      .select("id, code, label, default_reserve_m, color, icon, sort_order, is_system, updated_at")
      .eq("project_id", data.projectId)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createEndpointKind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const organization_id = await orgFor(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("endpoint_kinds")
      .insert({
        project_id: data.projectId,
        organization_id,
        code: data.code,
        label: data.label,
        default_reserve_m: data.defaultReserveM,
        color: data.color ?? null,
        icon: data.icon ?? null,
        sort_order: data.sortOrder ?? 500,
        is_system: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateEndpointKind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.label !== undefined) patch.label = data.label;
    if (data.defaultReserveM !== undefined) patch.default_reserve_m = data.defaultReserveM;
    if (data.color !== undefined) patch.color = data.color;
    if (data.icon !== undefined) patch.icon = data.icon;
    if (data.sortOrder !== undefined) patch.sort_order = data.sortOrder;
    const { error } = await supabase
      .from("endpoint_kinds")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteEndpointKind = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error: readErr } = await supabase
      .from("endpoint_kinds")
      .select("is_system")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (row?.is_system) throw new Error("Systémový typ nelze smazat");
    const { error } = await supabase.from("endpoint_kinds").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
