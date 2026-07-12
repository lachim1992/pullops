import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

async function projectCtx(supabase: any, projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Projekt nenalezen");
  return data as { organization_id: string };
}

// ================ CHAT ================
export const listChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid, limit: z.number().int().min(1).max(500).default(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_chat_messages" as never)
      .select("id, user_id, body, created_at, updated_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set(((rows as any[]) ?? []).map((r) => r.user_id).filter(Boolean)));
    const profiles = new Map<string, { name: string | null }>();
    if (userIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of profs ?? []) {
        profiles.set(p.id as string, { name: (p.full_name as string | null) ?? null });
      }
    }
    return ((rows as any[]) ?? []).map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      body: r.body as string,
      createdAt: r.created_at as string,
      authorName: profiles.get(r.user_id)?.name ?? profiles.get(r.user_id)?.email ?? "Neznámý",
    }));
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid, body: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await projectCtx(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("project_chat_messages" as never)
      .insert({
        project_id: data.projectId,
        organization_id: ctx.organization_id,
        user_id: userId,
        body: data.body,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const deleteChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_chat_messages" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================ TASKS ================
export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const [tasksRes, cpsRes] = await Promise.all([
      context.supabase
        .from("project_tasks" as never)
        .select("id, title, description, assigned_to, due_date, status, created_by, created_at, updated_at")
        .eq("project_id", data.projectId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("project_task_checkpoints" as never)
        .select("id, task_id, label, done, sort_order")
        .eq("project_id", data.projectId)
        .order("sort_order", { ascending: true }),
    ]);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (cpsRes.error) throw new Error(cpsRes.error.message);
    const cpsByTask = new Map<string, any[]>();
    for (const c of (cpsRes.data as any[]) ?? []) {
      const arr = cpsByTask.get(c.task_id) ?? [];
      arr.push({ id: c.id, label: c.label, done: c.done, sortOrder: c.sort_order });
      cpsByTask.set(c.task_id, arr);
    }
    return ((tasksRes.data as any[]) ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      description: (t.description as string | null) ?? null,
      assignedTo: (t.assigned_to as string | null) ?? null,
      dueDate: (t.due_date as string | null) ?? null,
      status: t.status as string,
      createdBy: (t.created_by as string | null) ?? null,
      createdAt: t.created_at as string,
      checkpoints: cpsByTask.get(t.id) ?? [],
    }));
  });

export const upsertTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        projectId: uuid,
        title: z.string().min(1).max(300),
        description: z.string().max(4000).nullable().optional(),
        assignedTo: uuid.nullable().optional(),
        dueDate: z.string().nullable().optional(),
        status: z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]).default("TODO"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await projectCtx(supabase, data.projectId);
    const patch = {
      project_id: data.projectId,
      organization_id: ctx.organization_id,
      title: data.title,
      description: data.description ?? null,
      assigned_to: data.assignedTo ?? null,
      due_date: data.dueDate ?? null,
      status: data.status,
    };
    if (data.id) {
      const { error } = await supabase.from("project_tasks" as never).update(patch as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("project_tasks" as never)
      .insert({ ...patch, created_by: userId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_tasks" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        taskId: uuid,
        projectId: uuid,
        label: z.string().min(1).max(300),
        done: z.boolean().default(false),
        sortOrder: z.number().int().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch = {
      task_id: data.taskId,
      project_id: data.projectId,
      label: data.label,
      done: data.done,
      sort_order: data.sortOrder,
    };
    if (data.id) {
      const { error } = await context.supabase.from("project_task_checkpoints" as never).update(patch as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("project_task_checkpoints" as never)
      .insert(patch as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const toggleCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, done: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_task_checkpoints" as never).update({ done: data.done } as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCheckpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_task_checkpoints" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ================ PHOTOS ================
export const listLobbyPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_lobby_photos" as never)
      .select("id, storage_path, caption, taken_at, uploaded_by, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const photos: Array<{ id: string; url: string | null; caption: string | null; createdAt: string; uploadedBy: string | null }> = [];
    for (const r of (rows as any[]) ?? []) {
      const { data: signed } = await context.supabase.storage
        .from("project-lobby-photos")
        .createSignedUrl(r.storage_path as string, 60 * 60);
      photos.push({
        id: r.id as string,
        url: signed?.signedUrl ?? null,
        caption: (r.caption as string | null) ?? null,
        createdAt: r.created_at as string,
        uploadedBy: (r.uploaded_by as string | null) ?? null,
      });
    }
    return photos;
  });

export const createLobbyPhotoRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: uuid,
        storagePath: z.string().min(1).max(500),
        caption: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await projectCtx(supabase, data.projectId);
    const { data: row, error } = await supabase
      .from("project_lobby_photos" as never)
      .insert({
        project_id: data.projectId,
        organization_id: ctx.organization_id,
        storage_path: data.storagePath,
        caption: data.caption ?? null,
        uploaded_by: userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const deleteLobbyPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    // fetch storage_path first
    const { data: row } = await context.supabase
      .from("project_lobby_photos" as never)
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row && (row as any).storage_path) {
      await context.supabase.storage.from("project-lobby-photos").remove([(row as any).storage_path]);
    }
    const { error } = await context.supabase.from("project_lobby_photos" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
