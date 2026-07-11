import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const SPOOL_STATUS = z.enum(["WAREHOUSE", "ON_STATION", "EMPTY", "ARCHIVED"]);

export const listSpools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [spoolsRes, typesRes] = await Promise.all([
      supabase
        .from("spools")
        .select(
          "id, serial_no, cable_type_id, manufacturer, batch_no, initial_length_m, current_length_m, status, notes, updated_at",
        )
        .eq("project_id", data.projectId)
        .order("serial_no", { ascending: true }),
      supabase
        .from("cable_types")
        .select("id, code")
        .eq("project_id", data.projectId),
    ]);
    if (spoolsRes.error) throw new Error(spoolsRes.error.message);
    if (typesRes.error) throw new Error(typesRes.error.message);
    const typeCodeById = new Map<string, string>();
    for (const t of typesRes.data ?? []) typeCodeById.set(t.id as string, t.code as string);
    return {
      spools: (spoolsRes.data ?? []).map((s) => ({
        id: s.id as string,
        serialNo: s.serial_no as string,
        cableTypeId: (s.cable_type_id as string | null) ?? null,
        cableTypeCode: s.cable_type_id ? typeCodeById.get(s.cable_type_id as string) ?? null : null,
        manufacturer: (s.manufacturer as string | null) ?? null,
        batchNo: (s.batch_no as string | null) ?? null,
        initialLengthM: Number(s.initial_length_m),
        currentLengthM: Number(s.current_length_m),
        status: s.status as string,
        notes: (s.notes as string | null) ?? null,
      })),
      cableTypes: (typesRes.data ?? []).map((t) => ({
        id: t.id as string,
        code: t.code as string,
      })),
    };
  });

export const upsertSpool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        projectId: uuid,
        serialNo: z.string().min(1).max(120),
        cableTypeId: uuid.nullable().optional(),
        manufacturer: z.string().max(200).nullable().optional(),
        batchNo: z.string().max(120).nullable().optional(),
        initialLengthM: z.number().positive().max(50000),
        currentLengthM: z.number().min(0).max(50000),
        status: SPOOL_STATUS.default("WAREHOUSE"),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.currentLengthM > data.initialLengthM) {
      throw new Error("current_length_m nesmí být větší než initial_length_m");
    }
    const patch = {
      project_id: data.projectId,
      serial_no: data.serialNo.trim(),
      cable_type_id: data.cableTypeId ?? null,
      manufacturer: data.manufacturer ?? null,
      batch_no: data.batchNo ?? null,
      initial_length_m: data.initialLengthM,
      current_length_m: data.currentLengthM,
      status: data.status,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await supabase.from("spools").update(patch as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("spools")
      .insert(patch as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });

export const deleteSpool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("spools").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Look up any entity by scanned code (returns entity_type + entity_id). */
export const resolveScanCode = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: uuid, code: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("scan_codes")
      .select("entity_type, entity_id, code_kind")
      .eq("project_id", data.projectId)
      .eq("code", data.code.trim())
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { found: false as const };
    return {
      found: true as const,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      codeKind: row.code_kind as string,
    };
  });

/** Register or replace a scan code for an entity. */
export const registerScanCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        entityType: z.enum(["SPOOL", "ENDPOINT", "DISPENSER_UNIT", "DISPENSER_SLOT"]),
        entityId: uuid,
        code: z.string().min(1).max(500),
        codeKind: z.enum(["QR", "BARCODE", "MANUAL"]).default("QR"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Replace any existing code for the same entity
    const del = await supabase
      .from("scan_codes")
      .delete()
      .eq("project_id", data.projectId)
      .eq("entity_type", data.entityType)
      .eq("entity_id", data.entityId);
    if (del.error) throw new Error(del.error.message);
    const { data: row, error } = await supabase
      .from("scan_codes")
      .insert({
        project_id: data.projectId,
        entity_type: data.entityType,
        entity_id: data.entityId,
        code: data.code.trim(),
        code_kind: data.codeKind,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id as string };
  });
