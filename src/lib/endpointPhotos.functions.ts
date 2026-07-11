import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "endpoint-photos";

async function endpointCtx(supabase: any, endpointId: string) {
  const { data, error } = await supabase
    .from("endpoints")
    .select("project_id, organization_id")
    .eq("id", endpointId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("endpoint not found");
  return data as { project_id: string; organization_id: string };
}

export const listEndpointPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ endpointId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("endpoint_photos")
      .select("id, storage_path, caption, created_at")
      .eq("endpoint_id", data.endpointId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return [];
    const paths = rows.map((r: any) => r.storage_path);
    const { data: signed, error: err2 } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, 60 * 30);
    if (err2) throw new Error(err2.message);
    return rows.map((r: any, i: number) => ({
      id: r.id as string,
      caption: (r.caption as string | null) ?? null,
      created_at: r.created_at as string,
      url: (signed?.[i]?.signedUrl as string | undefined) ?? null,
    }));
  });

export const registerEndpointPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        endpointId: z.string().uuid(),
        storagePath: z.string().min(1),
        caption: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await endpointCtx(supabase, data.endpointId);
    const { data: row, error } = await supabase
      .from("endpoint_photos")
      .insert({
        endpoint_id: data.endpointId,
        project_id: ctx.project_id,
        organization_id: ctx.organization_id,
        storage_path: data.storagePath,
        caption: data.caption ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteEndpointPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error: err0 } = await supabase
      .from("endpoint_photos")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (err0) throw new Error(err0.message);
    if (row?.storage_path) {
      await supabase.storage.from(BUCKET).remove([row.storage_path]);
    }
    const { error } = await supabase.from("endpoint_photos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
