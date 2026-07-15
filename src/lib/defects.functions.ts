import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const SEVERITIES = ["INFO", "DEFECT", "CRITICAL"] as const;
const STATUSES = ["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "REJECTED"] as const;
const ENTITY_TYPES = ["endpoint", "cable", "patch_panel", "photo", "other"] as const;

const BUCKET = "defect-photos";

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

async function isProjectMember(
  supabase: any,
  projectId: string,
  userId: string,
): Promise<boolean> {
  if (!userId || !projectId) return false;
  const { data, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

async function assertProjectMember(
  supabase: any,
  projectId: string,
  userId: string,
): Promise<void> {
  if (!(await isProjectMember(supabase, projectId, userId))) {
    throw new Error("Uživatel není členem tohoto projektu.");
  }
}

async function notify(
  supabase: any,
  args: {
    userId: string;
    projectId: string;
    organizationId: string;
    kind: string;
    title: string;
    body?: string | null;
    linkPath?: string | null;
    entityType?: string | null;
    entityId?: string | null;
  },
) {
  if (!args.userId) return;
  await supabase.from("notifications").insert({
    user_id: args.userId,
    project_id: args.projectId,
    organization_id: args.organizationId,
    kind: args.kind,
    title: args.title,
    body: args.body ?? null,
    link_path: args.linkPath ?? null,
    entity_type: args.entityType ?? null,
    entity_id: args.entityId ?? null,
  } as never);
  try {
    const { sendPushToUsers } = await import("@/lib/push.server");
    await sendPushToUsers([args.userId], {
      title: args.title,
      body: args.body ?? undefined,
      url: args.linkPath ?? `/projects/${args.projectId}`,
      tag: `${args.kind}:${args.entityId ?? args.projectId}`,
    });
  } catch (err) {
    console.error("push send failed", err);
  }
}

export const listDefects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("defects")
      .select(
        "id, code, title, description, severity, status, entity_type, entity_id, assigned_to, reported_by, resolved_by, resolved_at, resolution_note, created_at, updated_at",
      )
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const getDefect = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: def, error } = await supabase
      .from("defects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!def) throw new Error("Nenalezeno");

    const [photosRes, commentsRes] = await Promise.all([
      supabase
        .from("defect_photos")
        .select("id, storage_path, caption, created_at, created_by")
        .eq("defect_id", data.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("defect_comments")
        .select("id, user_id, body, created_at")
        .eq("defect_id", data.id)
        .order("created_at", { ascending: true }),
    ]);
    if (photosRes.error) throw new Error(photosRes.error.message);
    if (commentsRes.error) throw new Error(commentsRes.error.message);

    const photos: Array<{ id: string; url: string | null; caption: string | null; createdAt: string }> = [];
    for (const p of (photosRes.data as any[]) ?? []) {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(p.storage_path as string, 60 * 60);
      photos.push({
        id: p.id as string,
        url: signed?.signedUrl ?? null,
        caption: (p.caption as string | null) ?? null,
        createdAt: p.created_at as string,
      });
    }

    // author names
    const userIds = Array.from(
      new Set([
        ...(commentsRes.data ?? []).map((c: any) => c.user_id),
        (def as any).assigned_to,
        (def as any).reported_by,
        (def as any).resolved_by,
      ].filter(Boolean) as string[]),
    );
    const profiles = new Map<string, string>();
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
      for (const p of profs ?? []) profiles.set(p.id as string, (p.full_name as string) ?? "");
    }

    return {
      defect: def as any,
      photos,
      comments: ((commentsRes.data as any[]) ?? []).map((c) => ({
        id: c.id as string,
        userId: c.user_id as string,
        authorName: profiles.get(c.user_id) || "Neznámý",
        body: c.body as string,
        createdAt: c.created_at as string,
      })),
      profiles: Object.fromEntries(profiles),
    };
  });

export const upsertDefect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        projectId: uuid,
        title: z.string().min(1).max(300),
        description: z.string().max(4000).nullable().optional(),
        severity: z.enum(SEVERITIES).default("DEFECT"),
        entityType: z.enum(ENTITY_TYPES).nullable().optional(),
        entityId: uuid.nullable().optional(),
        assignedTo: uuid.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ctx = await projectCtx(supabase, data.projectId);
    if (data.assignedTo) {
      await assertProjectMember(supabase, data.projectId, data.assignedTo);
    }
    const patch = {
      project_id: data.projectId,
      organization_id: ctx.organization_id,
      title: data.title,
      description: data.description ?? null,
      severity: data.severity,
      entity_type: data.entityType ?? null,
      entity_id: data.entityId ?? null,
      assigned_to: data.assignedTo ?? null,
    };
    if (data.id) {
      const { error } = await supabase.from("defects").update(patch as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("defects")
      .insert({ ...patch, reported_by: userId } as never)
      .select("id, assigned_to, severity, title")
      .single();
    if (error) throw new Error(error.message);

    // Notify assignee
    if (data.assignedTo && data.assignedTo !== userId) {
      await notify(supabase, {
        userId: data.assignedTo,
        projectId: data.projectId,
        organizationId: ctx.organization_id,
        kind: "defect_assigned",
        title: `Přiřazena závada: ${data.title}`,
        body: `Severita: ${data.severity}`,
        linkPath: `/projects/${data.projectId}/defects/${(row as any).id}`,
        entityType: "defect",
        entityId: (row as any).id,
      });
    }
    // Auto-create task for CRITICAL
    if (data.severity === "CRITICAL") {
      await supabase.from("project_tasks").insert({
        project_id: data.projectId,
        organization_id: ctx.organization_id,
        title: `🚨 ${data.title}`,
        description: data.description ?? null,
        priority: "URGENT",
        status: "TODO",
        assigned_to: data.assignedTo ?? null,
        defect_id: (row as any).id,
        source_type: "defect",
        source_id: (row as any).id,
        created_by: userId,
      } as never);
    }
    return { id: (row as any).id as string };
  });

export const setDefectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(STATUSES),
        resolutionNote: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "RESOLVED" || data.status === "REJECTED") {
      patch.resolved_by = userId;
      patch.resolved_at = new Date().toISOString();
      if (data.resolutionNote) patch.resolution_note = data.resolutionNote;
    }
    const { data: def, error } = await supabase
      .from("defects")
      .update(patch as never)
      .eq("id", data.id)
      .select("project_id, organization_id, title, reported_by, assigned_to")
      .single();
    if (error) throw new Error(error.message);
    // Notify reporter of resolution
    if ((data.status === "RESOLVED" || data.status === "REJECTED") && (def as any).reported_by && (def as any).reported_by !== userId) {
      await notify(supabase, {
        userId: (def as any).reported_by as string,
        projectId: (def as any).project_id as string,
        organizationId: (def as any).organization_id as string,
        kind: "defect_resolved",
        title: `Závada ${data.status === "RESOLVED" ? "vyřešena" : "zamítnuta"}: ${(def as any).title}`,
        linkPath: `/projects/${(def as any).project_id}/defects/${data.id}`,
        entityType: "defect",
        entityId: data.id,
      });
    }
    return { ok: true };
  });

export const assignDefect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, assignedTo: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: defBefore, error: errBefore } = await supabase
      .from("defects")
      .select("project_id")
      .eq("id", data.id)
      .maybeSingle();
    if (errBefore) throw new Error(errBefore.message);
    if (!defBefore) throw new Error("Závada nenalezena");
    if (data.assignedTo) {
      await assertProjectMember(supabase, (defBefore as any).project_id, data.assignedTo);
    }
    const { data: def, error } = await supabase
      .from("defects")
      .update({ assigned_to: data.assignedTo } as never)
      .eq("id", data.id)
      .select("project_id, organization_id, title")
      .single();
    if (error) throw new Error(error.message);
    if (data.assignedTo && data.assignedTo !== userId) {
      await notify(supabase, {
        userId: data.assignedTo,
        projectId: (def as any).project_id,
        organizationId: (def as any).organization_id,
        kind: "defect_assigned",
        title: `Přiřazena závada: ${(def as any).title}`,
        linkPath: `/projects/${(def as any).project_id}/defects/${data.id}`,
        entityType: "defect",
        entityId: data.id,
      });
    }
    return { ok: true };
  });

export const addDefectComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ defectId: uuid, body: z.string().min(1).max(4000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: def, error: err0 } = await supabase
      .from("defects")
      .select("project_id, organization_id, assigned_to, reported_by, title")
      .eq("id", data.defectId)
      .maybeSingle();
    if (err0) throw new Error(err0.message);
    if (!def) throw new Error("Závada nenalezena");
    const { data: row, error } = await supabase
      .from("defect_comments")
      .insert({
        defect_id: data.defectId,
        project_id: (def as any).project_id,
        organization_id: (def as any).organization_id,
        user_id: userId,
        body: data.body,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    // Notify the other party — only if they are still project members
    const others = new Set<string>();
    for (const uid of [(def as any).assigned_to, (def as any).reported_by]) {
      if (uid && uid !== userId) others.add(uid);
    }
    for (const uid of others) {
      if (!(await isProjectMember(supabase, (def as any).project_id, uid))) continue;
      await notify(supabase, {
        userId: uid,
        projectId: (def as any).project_id,
        organizationId: (def as any).organization_id,
        kind: "defect_comment",
        title: `Nový komentář: ${(def as any).title}`,
        body: data.body.slice(0, 160),
        linkPath: `/projects/${(def as any).project_id}/defects/${data.defectId}`,
        entityType: "defect",
        entityId: data.defectId,
      });
    }
    return { id: (row as any).id as string };
  });

export const registerDefectPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        defectId: uuid,
        storagePath: z.string().min(1).max(500),
        caption: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: def, error: err0 } = await supabase
      .from("defects")
      .select("project_id, organization_id")
      .eq("id", data.defectId)
      .maybeSingle();
    if (err0) throw new Error(err0.message);
    if (!def) throw new Error("Závada nenalezena");
    const { data: row, error } = await supabase
      .from("defect_photos")
      .insert({
        defect_id: data.defectId,
        project_id: (def as any).project_id,
        organization_id: (def as any).organization_id,
        storage_path: data.storagePath,
        caption: data.caption ?? null,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id as string };
  });

export const deleteDefectPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("defect_photos")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row && (row as any).storage_path) {
      await supabase.storage.from(BUCKET).remove([(row as any).storage_path]);
    }
    const { error } = await supabase.from("defect_photos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const convertDefectToTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        defectId: uuid,
        title: z.string().min(1).max(300).optional(),
        assignedTo: uuid.nullable().optional(),
        priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("HIGH"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: def, error } = await supabase
      .from("defects")
      .select("project_id, organization_id, title, description, assigned_to")
      .eq("id", data.defectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!def) throw new Error("Závada nenalezena");
    const assigned = data.assignedTo ?? (def as any).assigned_to ?? null;
    const { data: row, error: err2 } = await supabase
      .from("project_tasks")
      .insert({
        project_id: (def as any).project_id,
        organization_id: (def as any).organization_id,
        title: data.title ?? `Řešení: ${(def as any).title}`,
        description: (def as any).description ?? null,
        priority: data.priority,
        status: "TODO",
        assigned_to: assigned,
        defect_id: data.defectId,
        source_type: "defect",
        source_id: data.defectId,
        created_by: userId,
      } as never)
      .select("id")
      .single();
    if (err2) throw new Error(err2.message);
    if (assigned && assigned !== userId) {
      await notify(supabase, {
        userId: assigned,
        projectId: (def as any).project_id,
        organizationId: (def as any).organization_id,
        kind: "task_assigned",
        title: `Nový úkol: ${(def as any).title}`,
        linkPath: `/projects/${(def as any).project_id}/defects/${data.defectId}`,
        entityType: "task",
        entityId: (row as any).id,
      });
    }
    return { id: (row as any).id as string };
  });

export const deleteDefect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("defects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Helper: list project members (for assignment picker)
export const listProjectMembersLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("project_members")
      .select("user_id")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    const ids = ((rows as any[]) ?? []).map((r) => r.user_id as string);
    if (ids.length === 0) return [];
    const { data: profs } = await context.supabase.from("profiles").select("id, full_name").in("id", ids);
    return ((profs as any[]) ?? []).map((p) => ({ id: p.id as string, name: (p.full_name as string) ?? "" }));
  });
