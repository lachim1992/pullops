import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CreateInput = z.object({
  projectId: z.string().uuid(),
  code: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  defaultReserveM: z.number().min(0).default(3),
  colorHint: z.string().max(32).optional(),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  code: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
  defaultReserveM: z.number().min(0).optional(),
  colorHint: z.string().max(32).nullable().optional(),
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

export const listCableTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("cable_types")
      .select("id, code, description, default_reserve_m, color_hint, updated_at")
      .eq("project_id", data.projectId)
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createCableType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const organization_id = await orgFor(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("cable_types")
      .insert({
        project_id: data.projectId,
        organization_id,
        code: data.code,
        description: data.description ?? null,
        default_reserve_m: data.defaultReserveM,
        color_hint: data.colorHint ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateCableType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.code !== undefined) patch.code = data.code;
    if (data.description !== undefined) patch.description = data.description;
    if (data.defaultReserveM !== undefined) patch.default_reserve_m = data.defaultReserveM;
    if (data.colorHint !== undefined) patch.color_hint = data.colorHint;
    const { error } = await supabase.from("cable_types").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCableType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("cable_types").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
