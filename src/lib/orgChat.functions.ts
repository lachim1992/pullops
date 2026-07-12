import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const listOrgChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: uuid,
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("organization_chat_messages" as never)
      .select("id, user_id, body, created_at")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    const messages = ((rows as any[]) ?? []) as Array<{
      id: string;
      user_id: string;
      body: string;
      created_at: string;
    }>;

    const userIds = Array.from(new Set(messages.map((r) => r.user_id).filter(Boolean)));
    const profiles = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      for (const p of (profs as any[]) ?? []) {
        profiles.set(p.id as string, (p.full_name as string | null) ?? null);
      }
    }

    return messages.map((r) => ({
      id: r.id,
      userId: r.user_id,
      body: r.body,
      createdAt: r.created_at,
      authorName: profiles.get(r.user_id) ?? "Neznámý",
    }));
  });

export const sendOrgChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        organizationId: uuid,
        body: z.string().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("organization_chat_messages" as never)
      .insert({
        organization_id: data.organizationId,
        user_id: userId,
        body: data.body,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Fire push to other org members (fire-and-forget).
    try {
      const [{ data: members }, { data: prof }] = await Promise.all([
        supabase
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", data.organizationId),
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
      ]);
      const recipients = (((members as any[]) ?? []).map((m) => m.user_id as string)).filter(
        (id) => id && id !== userId,
      );
      if (recipients.length > 0) {
        const { sendPushToUsers } = await import("@/lib/push.server");
        const author = (prof as { full_name?: string | null } | null)?.full_name ?? "Kolega";
        await sendPushToUsers(recipients, {
          title: `Firemní chat · ${author}`,
          body: data.body.slice(0, 140),
          url: `/org-chat?org=${data.organizationId}`,
          tag: `org-chat:${data.organizationId}`,
        });
      }
    } catch (err) {
      console.error("org chat push failed", err);
    }

    return { id: (row as any).id as string };
  });

export const deleteOrgChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("organization_chat_messages" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
