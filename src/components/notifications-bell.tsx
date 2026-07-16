import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, Rocket } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listMyNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications.functions";
import { cn } from "@/lib/utils";
import { useAppUpdate } from "@/hooks/use-app-update";
import { ChangelogDialog } from "@/components/changelog-dialog";


function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "teď";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export function NotificationsBell() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listMyNotifications);
  const fetchCount = useServerFn(countUnreadNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const appUpdate = useAppUpdate();

  const count = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => fetchCount(),
    refetchInterval: 60_000,
  });
  const list = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => fetchList({ data: { limit: 30 } }),
  });

  // Realtime subscription for the current user
  useEffect(() => {
    let ignore = false;
    supabase.auth.getUser().then(({ data }) => {
      if (ignore || !data.user) return;
      const uid = data.user.id;
      const channel = supabase
        .channel(`notif:${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
          (payload) => {
            qc.invalidateQueries({ queryKey: ["notifications"] });
            const n = payload.new as { title?: string; body?: string | null; link_path?: string | null };
            toast(n.title ?? "Nové oznámení", {
              description: n.body ?? undefined,
              action: n.link_path
                ? { label: "Otevřít", onClick: () => { window.location.href = n.link_path as string; } }
                : undefined,
            });
          },
        )
        .subscribe();
      // Cleanup
      (window as any).__pullops_notif_ch = channel;
    });
    return () => {
      ignore = true;
      const ch = (window as any).__pullops_notif_ch;
      if (ch) supabase.removeChannel(ch);
    };
  }, [qc]);

  const unread = count.data?.count ?? 0;
  const totalUnread = unread + (appUpdate.hasUpdate ? 1 : 0);
  const latestUnseen = appUpdate.unseenReleases[0];

  async function onOpenItem(id: string) {
    await markRead({ data: { id } });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="h-4 w-4" />
            {totalUnread > 0 && (
              <Badge
                className="absolute -right-0.5 -top-0.5 h-4 min-w-4 rounded-full border-0 bg-[color:var(--accent)] px-1 text-[10px] font-semibold text-primary-foreground"
                variant="default"
              >
                {totalUnread > 9 ? "9+" : totalUnread}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-96 p-0">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="font-display text-sm font-semibold">Oznámení</div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={async () => {
                if (unread > 0) {
                  await markAll();
                  qc.invalidateQueries({ queryKey: ["notifications"] });
                }
                if (appUpdate.hasUpdate) appUpdate.acknowledge();
              }}
              disabled={totalUnread === 0}
            >
              <Check className="mr-1 h-3 w-3" /> Vše přečteno
            </Button>
          </div>
          <ScrollArea className="h-[420px]">
            {appUpdate.hasUpdate && latestUnseen && (
              <button
                type="button"
                onClick={() => appUpdate.openChangelog()}
                className="flex w-full items-start gap-2.5 border-b bg-[color:var(--accent)]/10 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--accent)]/15"
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/15 text-accent">
                  <Rocket className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-semibold leading-snug">
                      Nová verze {latestUnseen.version}
                    </div>
                    <div className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-accent">
                      Novinka
                    </div>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {latestUnseen.title} · klikni pro changelog
                  </div>
                </div>
              </button>
            )}
            {(list.data ?? []).length === 0 && !appUpdate.hasUpdate ? (
              <div className="p-6 text-center text-xs text-muted-foreground">Zatím žádná oznámení.</div>
            ) : (
              <ul className="divide-y">
                {(list.data ?? []).map((n) => {
                  const inner = (
                    <div
                      className={cn(
                        "flex flex-col gap-1 px-3 py-2.5 transition-colors hover:bg-accent/30",
                        !n.readAt && "bg-[color:var(--accent)]/5",
                      )}
                      onClick={() => onOpenItem(n.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-medium leading-snug">{n.title}</div>
                        <div className="mt-0.5 shrink-0 font-mono text-[10px] text-muted-foreground">
                          {timeAgo(n.createdAt)}
                        </div>
                      </div>
                      {n.body && (
                        <div className="line-clamp-2 text-xs text-muted-foreground">{n.body}</div>
                      )}
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.linkPath ? (
                        <Link to={n.linkPath as never} className="block">
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
          <div className="border-t px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => appUpdate.openChangelog()}
            >
              <Rocket className="h-3 w-3" />
              Co je nového · v{appUpdate.currentVersion}
            </Button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <ChangelogDialog
        open={appUpdate.dialogOpen}
        onOpenChange={appUpdate.setDialogOpen}
        onAcknowledge={appUpdate.acknowledge}
        seenVersion={appUpdate.seenVersion}
      />
    </>
  );
}

