import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

const COMPLETION_STATUSES = ["PLANNED", "PULLED", "TERMINATED", "DONE", "CANCELLED"] as const;
export type CompletionStatus = (typeof COMPLETION_STATUSES)[number];

export const listCompletionTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("cables")
      .select("id, code, status, notes, tested_at, pulled_at")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return ((rows as any[]) ?? []).map((c) => ({
      id: c.id as string,
      cableId: c.id as string,
      cableCode: (c.code as string) ?? "?",
      status: c.status as CompletionStatus,
      testedAt: (c.tested_at as string | null) ?? null,
      pulledAt: (c.pulled_at as string | null) ?? null,
      cancelledReason: null as string | null,
      notes: (c.notes as string | null) ?? null,
    }));
  });

/**
 * Kabel status je odvozený (trigger). Uživatel může ručně jen:
 *  - CANCELLED (zrušit kabel)
 *  - restore (obnovit z CANCELLED zpět; status se přepočte)
 */
export const setCompletionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        taskId: uuid,
        status: z.enum(["CANCELLED", "RESTORE"]),
        cancelledReason: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.status === "CANCELLED") {
      const patch: Record<string, unknown> = { status: "CANCELLED" };
      if (data.cancelledReason) patch.notes = data.cancelledReason;
      const { error } = await supabase
        .from("cables")
        .update(patch as never)
        .eq("id", data.taskId);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    // RESTORE: nastavit PLANNED — pak si trigger při další úpravě znovu vypočítá,
    // ale my chceme okamžitý přepočet, proto toucheme pulled_at (no-op update).
    const { data: cur } = await supabase
      .from("cables")
      .select("pulled_at")
      .eq("id", data.taskId)
      .maybeSingle();
    const { error } = await supabase
      .from("cables")
      .update({ status: "PLANNED", pulled_at: (cur as any)?.pulled_at ?? null } as never)
      .eq("id", data.taskId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
