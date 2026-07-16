import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listOrgChatMessages,
  sendOrgChatMessage,
  deleteOrgChatMessage,
} from "@/lib/orgChat.functions";
import { listMyOrganizations } from "@/lib/orgs.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const searchSchema = z.object({ org: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/org-chat")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Firemní chat · PullOps" }, { name: "robots", content: "noindex" }] }),
  component: OrgChatPage,
});

function OrgChatPage() {
  const search = Route.useSearch();
  const listOrgs = useServerFn(listMyOrganizations);
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => listOrgs() });
  const activeOrgId = search.org ?? orgs.data?.[0]?.id;

  return (
    <AppShell contentClassName="max-w-none px-0 py-0 sm:px-0 sm:py-0">
      {!activeOrgId ? (
        <div className="p-4 text-sm text-muted-foreground">Vyberte organizaci na dashboardu.</div>
      ) : (
        <ChatPanel organizationId={activeOrgId} orgName={orgs.data?.find((o) => o.id === activeOrgId)?.name ?? ""} />
      )}
    </AppShell>
  );
}

function ChatPanel({ organizationId, orgName }: { organizationId: string; orgName: string }) {
  const qc = useQueryClient();
  const list = useServerFn(listOrgChatMessages);
  const send = useServerFn(sendOrgChatMessage);
  const del = useServerFn(deleteOrgChatMessage);
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [me, setMe] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  const messages = useQuery({
    queryKey: ["org-chat", organizationId],
    queryFn: () => list({ data: { organizationId, limit: 200 } }),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`org-chat-${organizationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "organization_chat_messages", filter: `organization_id=eq.${organizationId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["org-chat", organizationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [organizationId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.data?.length]);

  const sendMut = useMutation({
    mutationFn: async (text: string) => send({ data: { organizationId, body: text } }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["org-chat", organizationId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Odeslání selhalo"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-chat", organizationId] }),
    onError: (e: any) => toast.error(e?.message ?? "Smazání selhalo"),
  });

  const grouped = useMemo(() => {
    const items = messages.data ?? [];
    const out: Array<{ dayLabel: string; items: typeof items }> = [];
    let currentDay = "";
    for (const m of items) {
      const d = new Date(m.createdAt).toLocaleDateString("cs-CZ", { day: "2-digit", month: "long", year: "numeric" });
      if (d !== currentDay) {
        currentDay = d;
        out.push({ dayLabel: d, items: [] });
      }
      out[out.length - 1].items.push(m);
    }
    return out;
  }, [messages.data]);

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[500px] flex-col overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="border-b border-border/60 px-4 py-2 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
        {orgName || "organizace"}
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Načítám…
          </div>
        ) : (messages.data?.length ?? 0) === 0 ? (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Zatím žádné zprávy. Napište první.
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.dayLabel} className="space-y-2">
              <div className="sticky top-0 z-10 mx-auto w-fit rounded-full bg-background/80 px-3 py-0.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground backdrop-blur">
                {g.dayLabel}
              </div>
              {g.items.map((m) => {
                const mine = m.userId === me;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "group relative max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm",
                        mine
                          ? "bg-[color:var(--accent)] text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {!mine && (
                        <div className="mb-0.5 text-[11px] font-medium opacity-80">{m.authorName}</div>
                      )}
                      <div className="whitespace-pre-wrap break-words">{m.body}</div>
                      <div className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {new Date(m.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {mine && (
                        <button
                          onClick={() => delMut.mutate(m.id)}
                          className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Smazat"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = body.trim();
          if (!t) return;
          sendMut.mutate(t);
        }}
        className="flex items-end gap-2 border-t border-border/60 p-3"
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const t = body.trim();
              if (t) sendMut.mutate(t);
            }
          }}
          placeholder="Napište zprávu… (Enter odešle, Shift+Enter nový řádek)"
          rows={2}
          className="min-h-[44px] flex-1 resize-none"
        />
        <Button type="submit" disabled={sendMut.isPending || !body.trim()} size="icon">
          {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
