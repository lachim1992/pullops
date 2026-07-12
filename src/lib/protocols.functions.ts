import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const BUCKET = "protocol-photos";

async function signPhotos(
  supabase: any,
  rows: Array<{ id: string; storage_path: string; caption: string | null; created_at: string; uploaded_by: string | null }>,
) {
  const out: Array<{ id: string; url: string | null; caption: string | null; createdAt: string; uploadedBy: string | null }> = [];
  for (const r of rows) {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(r.storage_path, 60 * 60);
    out.push({
      id: r.id,
      url: signed?.signedUrl ?? null,
      caption: r.caption,
      createdAt: r.created_at,
      uploadedBy: r.uploaded_by,
    });
  }
  return out;
}

export const listProtocols = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_protocols")
      .select(
        "id, reference_number, title, description, location_note, floor_plan_id, participants, status, signed_by_name, signed_at, created_by, created_at, updated_at",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = ((rows as any[]) ?? []).map((r) => r.created_by).filter(Boolean);
    let names = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      names = new Map((profs ?? []).map((p: any) => [p.id as string, (p.full_name as string) || ""]));
    }

    // photo counts
    const idsStr = ((rows as any[]) ?? []).map((r) => r.id);
    const counts = new Map<string, number>();
    if (idsStr.length) {
      const { data: photos } = await context.supabase
        .from("protocol_photos")
        .select("protocol_id")
        .in("protocol_id", idsStr);
      for (const p of (photos as any[]) ?? []) {
        counts.set(p.protocol_id, (counts.get(p.protocol_id) ?? 0) + 1);
      }
    }

    return ((rows as any[]) ?? []).map((r) => ({
      ...r,
      author_name: names.get(r.created_by) || "",
      photo_count: counts.get(r.id) ?? 0,
    }));
  });

export const getProtocol = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("project_protocols")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Protokol nenalezen");

    const { data: photos } = await context.supabase
      .from("protocol_photos")
      .select("id, storage_path, caption, created_at, uploaded_by")
      .eq("protocol_id", data.id)
      .order("created_at", { ascending: true });
    const signed = await signPhotos(context.supabase, (photos as any[]) ?? []);

    let authorName = "";
    if ((row as any).created_by) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("full_name")
        .eq("id", (row as any).created_by)
        .maybeSingle();
      authorName = ((prof as any)?.full_name as string) || "";
    }

    let floorPlanName: string | null = null;
    if ((row as any).floor_plan_id) {
      const { data: fp } = await context.supabase
        .from("floor_plans")
        .select("name")
        .eq("id", (row as any).floor_plan_id)
        .maybeSingle();
      floorPlanName = ((fp as any)?.name as string) ?? null;
    }

    return { protocol: row as any, photos: signed, authorName, floorPlanName };
  });

export const createProtocol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        title: z.string().trim().min(1).max(200),
        description: z.string().max(10_000).nullable().optional(),
        locationNote: z.string().max(500).nullable().optional(),
        floorPlanId: uuid.nullable().optional(),
        participants: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj, error: perr } = await supabase
      .from("projects")
      .select("organization_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (perr) throw new Error(perr.message);
    if (!proj) throw new Error("Projekt nenalezen");

    const { data: row, error } = await supabase
      .from("project_protocols")
      .insert({
        project_id: data.projectId,
        organization_id: (proj as any).organization_id,
        title: data.title,
        description: data.description ?? null,
        location_note: data.locationNote ?? null,
        floor_plan_id: data.floorPlanId ?? null,
        participants: data.participants ?? null,
        reference_number: "P-0000", // overridden by trigger
        reference_seq: 0, // overridden by trigger
        created_by: userId,
      } as never)
      .select("id, reference_number")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; reference_number: string };
  });

export const updateProtocol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(10_000).nullable().optional(),
        locationNote: z.string().max(500).nullable().optional(),
        floorPlanId: uuid.nullable().optional(),
        participants: z.string().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.locationNote !== undefined) patch.location_note = data.locationNote;
    if (data.floorPlanId !== undefined) patch.floor_plan_id = data.floorPlanId;
    if (data.participants !== undefined) patch.participants = data.participants;
    const { error } = await context.supabase
      .from("project_protocols")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finalizeProtocol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        signedByName: z.string().trim().min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_protocols")
      .update({
        status: "FINALIZED",
        signed_by_name: data.signedByName,
        signed_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reopenProtocol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("project_protocols")
      .update({
        status: "DRAFT",
        signed_by_name: null,
        signed_at: null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProtocol = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    // fetch photos to remove from storage
    const { data: photos } = await context.supabase
      .from("protocol_photos")
      .select("storage_path")
      .eq("protocol_id", data.id);
    const paths = ((photos as any[]) ?? []).map((p) => p.storage_path).filter(Boolean);
    const { error } = await context.supabase
      .from("project_protocols")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (paths.length) {
      await context.supabase.storage.from(BUCKET).remove(paths);
    }
    return { ok: true };
  });

export const registerProtocolPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        protocolId: uuid,
        storagePath: z.string().min(1).max(500),
        caption: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p, error: perr } = await supabase
      .from("project_protocols")
      .select("project_id, organization_id")
      .eq("id", data.protocolId)
      .maybeSingle();
    if (perr) throw new Error(perr.message);
    if (!p) throw new Error("Protokol nenalezen");
    const { data: row, error } = await supabase
      .from("protocol_photos")
      .insert({
        project_id: (p as any).project_id,
        organization_id: (p as any).organization_id,
        protocol_id: data.protocolId,
        storage_path: data.storagePath,
        caption: data.caption ?? null,
        uploaded_by: userId,
      } as never)
      .select("id, storage_path, caption, created_at, uploaded_by")
      .single();
    if (error) throw new Error(error.message);
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl((row as any).storage_path, 60 * 60);
    return {
      id: (row as any).id,
      url: signed?.signedUrl ?? null,
      caption: (row as any).caption,
      createdAt: (row as any).created_at,
      uploadedBy: (row as any).uploaded_by,
    };
  });

export const deleteProtocolPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("protocol_photos")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const path = (row as any)?.storage_path as string | undefined;
    const { error } = await context.supabase
      .from("protocol_photos")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (path) await context.supabase.storage.from(BUCKET).remove([path]);
    return { ok: true };
  });
