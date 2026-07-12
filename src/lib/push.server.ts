/**
 * Server-only push sender. Do NOT import from client-reachable modules at
 * module scope — always `await import("@/lib/push.server")` from inside a
 * server function handler.
 */
import webpush from "web-push";

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:noreply@pullops.lovable.app";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return;
  if (!configure()) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", unique);
  if (error || !subs || subs.length === 0) return;

  const body = JSON.stringify(payload);
  const staleIds: string[] = [];

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          body,
          { TTL: 60 * 60 * 24 },
        );
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) staleIds.push(s.id);
        else console.error("web-push send failed", code, err);
      }
    }),
  );

  if (staleIds.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", staleIds);
  }
}
