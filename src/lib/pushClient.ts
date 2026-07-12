import { supabase } from "@/integrations/supabase/client";
import {
  getPushPublicKey,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push.functions";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function bufToBase64(buf: ArrayBuffer | null | undefined): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function enablePushOnThisDevice(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (!isPushSupported()) {
    return {
      ok: false,
      reason:
        "Toto zařízení nepodporuje push notifikace. Na iPhonu si nejdřív přidej aplikaci na plochu (Sdílet → Přidat na plochu).",
    };
  }

  // Ensure a fresh session before hitting a protected server fn.
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, reason: "Musíš být přihlášen." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notifikace byly zamítnuty." };
  }

  const reg =
    (await navigator.serviceWorker.getRegistration("/sw.js")) ??
    (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;

  const { publicKey } = await getPushPublicKey();
  if (!publicKey) return { ok: false, reason: "VAPID klíč není nakonfigurován." };

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyBytes = urlBase64ToUint8Array(publicKey);
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength,
      ) as ArrayBuffer,
    });
  }

  const json = sub.toJSON();
  await subscribeToPush({
    data: {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? bufToBase64(sub.getKey("p256dh")),
      auth: json.keys?.auth ?? bufToBase64(sub.getKey("auth")),
      userAgent: navigator.userAgent.slice(0, 500),
    },
  });

  return { ok: true };
}

export async function disablePushOnThisDevice(): Promise<void> {
  const sub = await getExistingPushSubscription();
  if (!sub) return;
  try {
    await unsubscribeFromPush({ data: { endpoint: sub.endpoint } });
  } catch (_e) {
    /* ignore */
  }
  try {
    await sub.unsubscribe();
  } catch (_e) {
    /* ignore */
  }
}
