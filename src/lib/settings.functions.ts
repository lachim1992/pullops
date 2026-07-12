import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbErrorMessage } from "@/lib/dbErrors";

const UpdateProfileInput = z.object({
  full_name: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  default_organization_id: z.string().uuid().nullable().optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateProfileInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    if (data.full_name !== undefined) patch.full_name = data.full_name;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.default_organization_id !== undefined)
      patch.default_organization_id = data.default_organization_id;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

export const leaveOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("leave_organization_tx", {
      p_organization_id: data.organizationId,
    });
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

const PREF_KEYS = [
  "inapp_task_assigned",
  "inapp_defect_assigned",
  "inapp_defect_status",
  "inapp_chat_mention",
  "inapp_project_member",
  "email_task_assigned",
  "email_defect_assigned",
  "email_defect_status",
  "email_chat_mention",
  "email_project_member",
] as const;

export type NotificationPrefs = Record<(typeof PREF_KEYS)[number], boolean>;

function defaults(): NotificationPrefs {
  return {
    inapp_task_assigned: true,
    inapp_defect_assigned: true,
    inapp_defect_status: true,
    inapp_chat_mention: true,
    inapp_project_member: true,
    email_task_assigned: false,
    email_defect_assigned: false,
    email_defect_status: false,
    email_chat_mention: false,
    email_project_member: false,
  };
}

export const getMyNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_notification_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(dbErrorMessage(error));
    if (!data) return defaults();
    const out = defaults();
    for (const k of PREF_KEYS) {
      const v = (data as Record<string, unknown>)[k];
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  });

const PrefsInput = z.object(
  Object.fromEntries(PREF_KEYS.map((k) => [k, z.boolean()])) as Record<
    (typeof PREF_KEYS)[number],
    z.ZodBoolean
  >,
);

export const setMyNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PrefsInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_notification_prefs")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });
