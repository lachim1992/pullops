import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbErrorMessage } from "@/lib/dbErrors";

export const getPushPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.VAPID_PUBLIC_KEY ?? "" };
});

const SubInput = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  userAgent: z.string().max(500).optional(),
});

export const subscribeToPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

export const unsubscribeFromPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ endpoint: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", data.endpoint);
    if (error) throw new Error(dbErrorMessage(error));
    return { ok: true };
  });

export const listMyPushDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("push_subscriptions")
      .select("id, endpoint, user_agent, created_at, last_seen_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(dbErrorMessage(error));
    return data ?? [];
  });

export const sendTestPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { sendPushToUsers } = await import("@/lib/push.server");
    await sendPushToUsers([context.userId], {
      title: "PullOps",
      body: "Testovací notifikace — push funguje 👌",
      url: "/settings",
      tag: "test",
    });
    return { ok: true };
  });
