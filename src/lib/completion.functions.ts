import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const COMPLETION_STATUSES = ["PULLED", "TERMINATED", "TESTED", "DONE", "CANCELLED"] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

export const listCompletionTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [tasksRes, cablesRes] = await Promise.all([
      supabase
        .from("pull_tasks")
        .select(
          "id, cable_id, status, started_at, done_at, terminated_at, terminated_by, tested_at, tested_by, cancelled_at, cancelled_by, cancelled_reason, notes",
        )
        .eq("project_id", data.projectId)
        .in("status", COMPLETION_STATUSES as unknown as string[]),
      supabase
        .from("cables")
        .select("id, code, cable_type_id, from_endpoint_id, to_endpoint_id")
        .eq("project_id", data.projectId),
    ]);
    if (tasksRes.error) throw new Error(tasksRes.error.message);
    if (cablesRes.error) throw new Error(cablesRes.error.message);
    const cableMap = new Map<string, any>();
    for (const c of cablesRes.data ?? []) cableMap.set(c.id as string, c);
    return ((tasksRes.data as any[]) ?? []).map((t) => {
      const c = cableMap.get(t.cable_id);
      return {
        id: t.id as string,
        cableId: t.cable_id as string,
        cableCode: (c?.code as string) ?? "?",
        status: t.status as CompletionStatus,
        startedAt: (t.started_at as string | null) ?? null,
        doneAt: (t.done_at as string | null) ?? null,
        terminatedAt: (t.terminated_at as string | null) ?? null,
        testedAt: (t.tested_at as string | null) ?? null,
        cancelledAt: (t.cancelled_at as string | null) ?? null,
        cancelledReason: (t.cancelled_reason as string | null) ?? null,
        notes: (t.notes as string | null) ?? null,
      };
    });
  });

export const setCompletionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        taskId: uuid,
        status: z.enum(COMPLETION_STATUSES),
        cancelledReason: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "TERMINATED") {
      patch.terminated_at = now;
      patch.terminated_by = userId;
    } else if (data.status === "TESTED") {
      patch.tested_at = now;
      patch.tested_by = userId;
    } else if (data.status === "DONE") {
      patch.done_at = now;
    } else if (data.status === "CANCELLED") {
      patch.cancelled_at = now;
      patch.cancelled_by = userId;
      patch.cancelled_reason = data.cancelledReason ?? null;
    }
    const { error } = await supabase.from("pull_tasks").update(patch as never).eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
