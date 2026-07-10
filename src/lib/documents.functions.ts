import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DocumentKind = z.enum(["FLOOR_PLAN", "SCHEMATIC", "OTHER"]);

const RegisterDocInput = z.object({
  projectId: z.string().uuid(),
  kind: DocumentKind,
  title: z.string().min(1).max(200),
  storagePath: z.string().min(1),
  mimeType: z.string().max(200).optional(),
  pageCount: z.number().int().positive().optional(),
});

const ListInput = z.object({ projectId: z.string().uuid() });
const DeleteInput = z.object({ id: z.string().uuid() });

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

export const listProjectDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("project_documents")
      .select("id, kind, title, storage_path, mime_type, page_count, uploaded_by, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const registerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RegisterDocInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const organization_id = await orgFor(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("project_documents")
      .insert({
        project_id: data.projectId,
        organization_id,
        kind: data.kind,
        title: data.title,
        storage_path: data.storagePath,
        mime_type: data.mimeType ?? null,
        page_count: data.pageCount ?? null,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const getDocumentSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("project_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("document not found");
    const { data: signed, error: err2 } = await supabase.storage
      .from("project-documents")
      .createSignedUrl(row.storage_path, 60 * 30);
    if (err2) throw new Error(err2.message);
    return { url: signed.signedUrl };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error: err0 } = await supabase
      .from("project_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (err0) throw new Error(err0.message);
    if (row?.storage_path) {
      await supabase.storage.from("project-documents").remove([row.storage_path]);
    }
    const { error } = await supabase.from("project_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
