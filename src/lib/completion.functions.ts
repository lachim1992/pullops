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
    const { data: rows, error } = await supabase
      .from("cables")
      .select("id, code, status, notes")
      .eq("project_id", data.projectId)
      .in("status", COMPLETION_STATUSES as unknown as never);
    if (error) throw new Error(error.message);
    return ((rows as any[]) ?? []).map((c) => ({
      id: c.id as string,
      cableId: c.id as string,
      cableCode: (c.code as string) ?? "?",
      status: c.status as CompletionStatus,
      cancelledReason: null as string | null,
      notes: (c.notes as string | null) ?? null,
    }));
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
    const { supabase } = context;
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "CANCELLED" && data.cancelledReason) {
      patch.notes = data.cancelledReason;
    }
    const { error } = await supabase
      .from("cables")
      .update(patch as never)
      .eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
