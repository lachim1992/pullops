import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbErrorMessage } from "@/lib/dbErrors";

const CreateInput = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  level: z.number().int(),
  displayOrder: z.number().int().optional(),
});

const UpdateInput = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200).optional(),
  level: z.number().int().optional(),
  displayOrder: z.number().int().optional(),
});

const CalibrationInput = z.object({
  floorPlanId: z.string().uuid(),
  a: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  b: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  realDistanceM: z.number().positive(),
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

export const listFloorPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("floor_plans")
      .select("id, name, level, display_order, document_id, created_at")
      .eq("project_id", data.projectId)
      .order("display_order", { ascending: true })
      .order("level", { ascending: true });
    if (error) throw new Error(dbErrorMessage(error));
    return rows ?? [];
  });

export const getFloorPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("floor_plans")
      .select("id, project_id, name, level, display_order, document_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(dbErrorMessage(error));
    if (!row) throw new Error("floor plan not found");

    const [{ data: cal }, { data: doc }] = await Promise.all([
      supabase
        .from("floor_plan_calibrations")
        .select(
          "point_a_norm_x, point_a_norm_y, point_b_norm_x, point_b_norm_y, real_distance_m, calibrated_at",
        )
        .eq("floor_plan_id", data.id)
        .maybeSingle(),
      row.document_id
        ? supabase
            .from("project_documents")
            .select("id, title, storage_path, mime_type")
            .eq("id", row.document_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let documentUrl: string | null = null;
    if (doc?.storage_path) {
      const { data: signed } = await supabase.storage
        .from("project-documents")
        .createSignedUrl(doc.storage_path, 60 * 30);
      documentUrl = signed?.signedUrl ?? null;
    }

    return { plan: row, calibration: cal ?? null, document: doc ?? null, documentUrl };
  });

export const createFloorPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const organization_id = await orgFor(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("floor_plans")
      .insert({
        project_id: data.projectId,
        organization_id,
        document_id: data.documentId ?? null,
        name: data.name,
        level: data.level,
        display_order: data.displayOrder ?? 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(dbErrorMessage(error));
    return { id: row.id as string };
  });

export const updateFloorPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: Record<string, unknown> = {};
    if (data.documentId !== undefined) patch.document_id = data.documentId;
    if (data.name !== undefined) patch.name = data.name;
    if (data.level !== undefined) patch.level = data.level;
    if (data.displayOrder !== undefined) patch.display_order = data.displayOrder;
    const { error } = await supabase
      .from("floor_plans")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

export const deleteFloorPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("floor_plans").delete().eq("id", data.id);
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

export const setCalibration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CalibrationInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: plan, error: perr } = await supabase
      .from("floor_plans")
      .select("project_id")
      .eq("id", data.floorPlanId)
      .maybeSingle();
    if (perr) throw new Error(dbErrorMessage(perr));
    if (!plan) throw new Error("floor plan not found");
    const { error } = await supabase.from("floor_plan_calibrations").upsert(
      {
        floor_plan_id: data.floorPlanId,
        project_id: plan.project_id,
        point_a_norm_x: data.a.x,
        point_a_norm_y: data.a.y,
        point_b_norm_x: data.b.x,
        point_b_norm_y: data.b.y,
        real_distance_m: data.realDistanceM,
        calibrated_by: userId,
        calibrated_at: new Date().toISOString(),
      },
      { onConflict: "floor_plan_id" },
    );
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });
