import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageSquare,
  ListChecks,
  Camera,
  Send,
  Plus,
  Trash2,
  X,
  ImagePlus,
  Loader2,
  Flag,
  GripVertical,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  listChatMessages,
  sendChatMessage,
  deleteChatMessage,
  listTasks,
  upsertTask,
  moveTask,
  deleteTask,
  upsertCheckpoint,
  toggleCheckpoint,
  deleteCheckpoint,
  listLobbyPhotos,
  createLobbyPhotoRecord,
  deleteLobbyPhoto,
  listProjectMembers,
} from "@/lib/lobby.functions";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  tab: z.enum(["tasks", "photos"]).optional(),
});

export const Route = createFileRoute("/_authenticated/projects/$projectId/lobby")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Lobby · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: LobbyPage,
});

function LobbyPage() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = search.tab ?? "chat";
  return (
    <AppShell projectId={projectId}>
      <div className="animate-fade-in space-y-5">
        <header>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            Projekt / Lobby
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            {tab === "tasks" ? "Úkoly" : tab === "photos" ? "Fotky lobby" : "Chat"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Živý chat s fotkami, úkoly týmu a lobby fotky.
          </p>
        </header>

        <Tabs
          value={tab}
          onValueChange={(v) =>
            navigate({ search: { tab: v as "chat" | "tasks" | "photos" }, replace: true })
          }
          className="w-full"
        >
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="chat" className="gap-2">
              <MessageSquare className="h-4 w-4" /> Chat
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <ListChecks className="h-4 w-4" /> Úkoly
            </TabsTrigger>
            <TabsTrigger value="photos" className="gap-2">
              <Camera className="h-4 w-4" /> Fotky
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="mt-4 animate-fade-in">
            <ChatTab projectId={projectId} />
          </TabsContent>
          <TabsContent value="tasks" className="mt-4 animate-fade-in">
            <TasksTab projectId={projectId} />
          </TabsContent>
          <TabsContent value="photos" className="mt-4 animate-fade-in">
            <PhotosTab projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}


// ================ CHAT ================
type ChatMsg = {
  id: string;
  userId: string;
  body: string;
  createdAt: string;
  authorName: string;
  defectId: string | null;
  attachments: Array<{ id: string; url: string | null }>;
};

function ChatTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchMsgs = useServerFn(listChatMessages);
  const fetchPhotos = useServerFn(listLobbyPhotos);
  const sendFn = useServerFn(sendChatMessage);
  const delFn = useServerFn(deleteChatMessage);
  const createPhotoRec = useServerFn(createLobbyPhotoRecord);

  const [body, setBody] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<
    Array<{ id: string; url: string | null }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; ts: number }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const meRef = useRef<{ id: string; name: string } | null>(null);
  const channelRef = useRef<any>(null);

  const msgs = useQuery<ChatMsg[]>({
    queryKey: ["chat", projectId],
    queryFn: () => fetchMsgs({ data: { projectId, limit: 200 } }),
  });
  const photos = useQuery({
    queryKey: ["lobby-photos", projectId],
    queryFn: () => fetchPhotos({ data: { projectId } }),
  });

  // Realtime for messages + presence-based typing indicator
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: udata } = await supabase.auth.getUser();
      const u = udata.user;
      if (!u) return;
      const name =
        (u.user_metadata as any)?.full_name ||
        (u.user_metadata as any)?.name ||
        u.email ||
        "Uživatel";
      if (!mounted) return;
      meRef.current = { id: u.id, name };

      const ch = supabase
        .channel(`lobby:${projectId}`, { config: { broadcast: { self: false } } })
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_chat_messages",
            filter: `project_id=eq.${projectId}`,
          },
          () => qc.invalidateQueries({ queryKey: ["chat", projectId] }),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_lobby_photos",
            filter: `project_id=eq.${projectId}`,
          },
          () => qc.invalidateQueries({ queryKey: ["lobby-photos", projectId] }),
        )
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const p = payload as { userId: string; name: string };
          if (!p?.userId || p.userId === meRef.current?.id) return;
          setTypingUsers((prev) => ({
            ...prev,
            [p.userId]: { name: p.name, ts: Date.now() },
          }));
        })
        .subscribe();
      channelRef.current = ch;
    })();

    const interval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.ts < 3500) next[k] = v;
        }
        return next;
      });
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [projectId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.data?.length]);

  function pingTyping() {
    const me = meRef.current;
    const ch = channelRef.current;
    if (!me || !ch) return;
    ch.send({ type: "broadcast", event: "typing", payload: { userId: me.id, name: me.name } });
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { data: udata } = await supabase.auth.getUser();
      const uid = udata.user?.id;
      if (!uid) throw new Error("Nepřihlášen");
      const added: Array<{ id: string; url: string | null }> = [];
      for (const file of Array.from(files)) {
        const path = `${projectId}/${uid}/${crypto.randomUUID()}-${file.name}`;
        const up = await supabase.storage
          .from("project-lobby-photos")
          .upload(path, file, { upsert: false });
        if (up.error) throw new Error(up.error.message);
        const rec = await createPhotoRec({
          data: { projectId, storagePath: path, caption: null },
        });
        added.push({ id: rec.id, url: rec.url });
      }
      setPendingAttachments((cur) => [...cur, ...added]);
      qc.invalidateQueries({ queryKey: ["lobby-photos", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba nahrávání");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSend() {
    const b = body.trim();
    if (!b && pendingAttachments.length === 0) return;
    const text = b || "📷";
    const attachIds = pendingAttachments.map((a) => a.id);
    setBody("");
    setPendingAttachments([]);
    try {
      await sendFn({
        data: {
          projectId,
          body: text,
          attachmentPhotoIds: attachIds.length > 0 ? attachIds : undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["chat", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
      setBody(b);
      setPendingAttachments(
        attachIds.map((id) => ({
          id,
          url: pendingAttachments.find((p) => p.id === id)?.url ?? null,
        })),
      );
    }
  }

  function attachExistingPhoto(id: string, url: string | null) {
    setPendingAttachments((cur) => {
      if (cur.find((c) => c.id === id)) return cur;
      return [...cur, { id, url }];
    });
  }

  const typingList = Object.values(typingUsers);
  const photoStrip = (photos.data ?? []).slice(0, 20);

  return (
    <Card className="card-noir overflow-hidden border-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--accent)_18%,transparent),0_24px_70px_-38px_var(--accent)]">
      <CardContent className="p-0">
        {/* Photo strip */}
        <div className="border-b border-primary/20 bg-primary/5 px-3 py-2">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Live fotostream
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => uploadFiles(e.target.files)}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ImagePlus className="h-3 w-3" />
                )}
                {uploading ? "Nahrávám" : "Přidat foto"}
              </Button>
            </div>
          </div>
          <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
            {photoStrip.length === 0 && (
              <div className="py-3 text-center text-xs text-muted-foreground italic w-full">
                Zatím žádné fotky. Přetáhněte nebo klikněte na „Přidat foto".
              </div>
            )}
            {photoStrip.map((p) => (
              <button
                key={p.id}
                onClick={() => attachExistingPhoto(p.id, p.url)}
                title="Připnout do zprávy"
                className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border/50 bg-black/40 transition-all hover:border-primary/60 hover:shadow-md"
              >
                {p.url ? (
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px]">…</div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                  <ImagePlus className="h-4 w-4 text-white" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="min-h-[420px] space-y-3 overflow-y-auto p-4 md:h-[560px]">
          {(msgs.data ?? []).length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Zatím žádné zprávy. Napište první nebo přidejte fotku.
            </div>
          )}
          {(msgs.data ?? []).map((m) => (
            <ChatBubble
              key={m.id}
              msg={m}
              isMe={m.userId === meRef.current?.id}
              onDelete={async () => {
                await delFn({ data: { id: m.id } });
                qc.invalidateQueries({ queryKey: ["chat", projectId] });
              }}
            />
          ))}
        </div>

        {/* Typing indicator */}
        <div className="border-t border-border/60 px-4 py-1.5 min-h-[28px]">
          {typingList.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in">
              <TypingDots />
              <span>
                {typingList.map((t) => t.name).join(", ")} {typingList.length === 1 ? "píše" : "píší"}…
              </span>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-primary/20 bg-primary/5 p-3">
          {pendingAttachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {pendingAttachments.map((a) => (
                <div
                  key={a.id}
                  className="group relative h-14 w-14 overflow-hidden rounded-md border border-primary/50"
                >
                  {a.url && <img src={a.url} alt="" className="h-full w-full object-cover" />}
                  <button
                    onClick={() =>
                      setPendingAttachments((cur) => cur.filter((c) => c.id !== a.id))
                    }
                    className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              size="icon"
              variant="ghost"
              className="shrink-0"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Připnout fotku"
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Input
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                pingTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Napište zprávu…"
              className="font-mono"
            />
            <Button
              onClick={onSend}
              disabled={!body.trim() && pendingAttachments.length === 0}
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: "150ms" }} />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" style={{ animationDelay: "300ms" }} />
    </span>
  );
}

function ChatBubble({
  msg,
  isMe,
  onDelete,
}: {
  msg: ChatMsg;
  isMe: boolean;
  onDelete: () => void;
}) {
  return (
    <div className={cn("group flex gap-3 animate-fade-in", isMe && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-xs",
          isMe ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        {msg.authorName.slice(0, 2).toUpperCase()}
      </div>
      <div className={cn("min-w-0 max-w-[75%]", isMe && "items-end text-right")}>
        <div className={cn("mb-0.5 flex items-baseline gap-2 text-[10px]", isMe && "flex-row-reverse")}>
          <span className="font-mono font-semibold text-foreground">{msg.authorName}</span>
          <span className="font-mono text-muted-foreground">
            {new Date(msg.createdAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 opacity-0 group-hover:opacity-100"
            onClick={onDelete}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        <div
          className={cn(
            "inline-block rounded-2xl px-3 py-2 text-sm",
            isMe ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        </div>
        {msg.attachments.length > 0 && (
          <div className={cn("mt-1.5 flex flex-wrap gap-1.5", isMe && "justify-end")}>
            {msg.attachments.map((a) => (
              <a
                key={a.id}
                href={a.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block h-24 w-24 overflow-hidden rounded-md border border-border/60 bg-black/30 transition-transform hover:scale-105"
              >
                {a.url && <img src={a.url} alt="" className="h-full w-full object-cover" />}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ================ TASKS (Kanban) ================
type Task = {
  id: string;
  title: string;
  description: string | null;
  assignedTo: string | null;
  dueDate: string | null;
  status: string;
  priority: string;
  labels: string[];
  sortOrder: number;
  defectId: string | null;
  checkpoints: Array<{ id: string; label: string; done: boolean; sortOrder: number }>;
};

const PRIORITY_META: Record<
  string,
  { label: string; className: string; dot: string }
> = {
  LOW: { label: "Nízká", className: "text-slate-300 border-slate-500/30 bg-slate-500/10", dot: "bg-slate-400" },
  NORMAL: { label: "Normal", className: "text-sky-300 border-sky-500/30 bg-sky-500/10", dot: "bg-sky-400" },
  HIGH: { label: "Vysoká", className: "text-amber-300 border-amber-500/30 bg-amber-500/10", dot: "bg-amber-400" },
  URGENT: { label: "Kritická", className: "text-red-300 border-red-500/40 bg-red-500/15", dot: "bg-red-500" },
};

const STATUS_COLUMNS: Array<{
  key: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  label: string;
  tone: string;
}> = [
  { key: "TODO", label: "K řešení", tone: "border-slate-500/40" },
  { key: "IN_PROGRESS", label: "Probíhá", tone: "border-blue-500/50" },
  { key: "DONE", label: "Hotovo", tone: "border-emerald-500/50" },
  { key: "CANCELLED", label: "Zrušeno", tone: "border-neutral-500/40" },
];

function TasksTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchTasks = useServerFn(listTasks);
  const fetchMembers = useServerFn(listProjectMembers);
  const upsertFn = useServerFn(upsertTask);
  const moveFn = useServerFn(moveTask);
  const deleteFn = useServerFn(deleteTask);
  const upsertCp = useServerFn(upsertCheckpoint);
  const toggleCp = useServerFn(toggleCheckpoint);
  const deleteCp = useServerFn(deleteCheckpoint);

  const tasks = useQuery<Task[]>({
    queryKey: ["tasks", projectId],
    queryFn: () => fetchTasks({ data: { projectId } }),
  });
  const members = useQuery({
    queryKey: ["lobby-members", projectId],
    queryFn: () => fetchMembers({ data: { projectId } }),
  });
  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of members.data ?? []) m.set(it.id, it.name || it.id.slice(0, 8));
    return m;
  }, [members.data]);

  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const byColumn = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const c of STATUS_COLUMNS) map.set(c.key, []);
    for (const t of tasks.data ?? []) {
      const arr = map.get(t.status) ?? [];
      arr.push(t);
      map.set(t.status, arr);
    }
    // sort each column by sortOrder ASC
    for (const [, arr] of map) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [tasks.data]);

  async function handleDrop(colKey: Task["status"]) {
    if (!dragId) return;
    const task = tasks.data?.find((t) => t.id === dragId);
    if (!task) return;
    if (task.status === colKey) {
      setDragId(null);
      setDragOverCol(null);
      return;
    }
    // put at end of target column
    const list = byColumn.get(colKey) ?? [];
    const newSort = list.length > 0 ? (list[list.length - 1].sortOrder ?? 0) + 10 : 10;
    try {
      await moveFn({ data: { id: task.id, status: colKey, sortOrder: newSort } });
      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba přesunu");
    } finally {
      setDragId(null);
      setDragOverCol(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-xs text-muted-foreground">
          Kanban · celkem {tasks.data?.length ?? 0}
        </div>
        <CreateTaskDialog
          open={open}
          onOpenChange={setOpen}
          projectId={projectId}
          members={members.data ?? []}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        {STATUS_COLUMNS.map((col) => {
          const items = byColumn.get(col.key) ?? [];
          const isOver = dragOverCol === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(col.key);
              }}
              onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
              onDrop={() => handleDrop(col.key)}
              className={cn(
                "rounded-lg border bg-card/30 p-2 transition-colors",
                col.tone,
                isOver && "bg-primary/5 border-primary/60",
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {col.label}
                </div>
                <Badge variant="outline" className="h-5 font-mono text-[10px]">
                  {items.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <KanbanCard
                    key={t.id}
                    task={t}
                    assigneeName={t.assignedTo ? memberMap.get(t.assignedTo) : null}
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => setDragId(null)}
                    onDelete={async () => {
                      await deleteFn({ data: { id: t.id } });
                      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
                    }}
                    onEdit={async (patch) => {
                      await upsertFn({
                        data: {
                          id: t.id,
                          projectId,
                          title: patch.title ?? t.title,
                          description: patch.description ?? t.description,
                          dueDate: patch.dueDate ?? t.dueDate,
                          assignedTo: patch.assignedTo ?? t.assignedTo,
                          priority: (patch.priority ?? t.priority) as any,
                          labels: patch.labels ?? t.labels,
                          status: t.status as any,
                        },
                      });
                      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
                    }}
                    onAddCp={async (label) => {
                      await upsertCp({
                        data: {
                          taskId: t.id,
                          projectId,
                          label,
                          done: false,
                          sortOrder: (t.checkpoints?.length ?? 0) + 1,
                        },
                      });
                      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
                    }}
                    onToggleCp={async (id, done) => {
                      await toggleCp({ data: { id, done } });
                      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
                    }}
                    onDeleteCp={async (id) => {
                      await deleteCp({ data: { id } });
                      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
                    }}
                    onStatusChange={async (status) => {
                      if (status === t.status) return;
                      const list = byColumn.get(status) ?? [];
                      const newSort = list.length > 0 ? (list[list.length - 1].sortOrder ?? 0) + 10 : 10;
                      try {
                        await moveFn({ data: { id: t.id, status, sortOrder: newSort } });
                        qc.invalidateQueries({ queryKey: ["tasks", projectId] });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Chyba přesunu");
                      }
                    }}
                    members={members.data ?? []}
                  />
                ))}
                {items.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-[11px] text-muted-foreground">
                    Přetáhněte úkol sem
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  projectId,
  members,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  members: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const upsertFn = useServerFn(upsertTask);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"LOW" | "NORMAL" | "HIGH" | "URGENT">("NORMAL");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [labelsInput, setLabelsInput] = useState("");

  async function submit() {
    if (!title.trim()) return;
    const labels = labelsInput
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 10);
    await upsertFn({
      data: {
        projectId,
        title: title.trim(),
        description: description || null,
        dueDate: dueDate || null,
        priority,
        assignedTo: assignedTo || null,
        labels,
        status: "TODO",
      },
    });
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("NORMAL");
    setAssignedTo("");
    setLabelsInput("");
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" /> Nový úkol
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Nový úkol</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Název
            </label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Popis
            </label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Priorita
              </label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Nízká</SelectItem>
                  <SelectItem value="NORMAL">Normální</SelectItem>
                  <SelectItem value="HIGH">Vysoká</SelectItem>
                  <SelectItem value="URGENT">Kritická</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Termín
              </label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Přiřadit
            </label>
            <Select
              value={assignedTo || "__none"}
              onValueChange={(v) => setAssignedTo(v === "__none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Nikomu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Nikomu</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Štítky (oddělené čárkou)
            </label>
            <Input
              value={labelsInput}
              onChange={(e) => setLabelsInput(e.target.value)}
              placeholder="např. rack, kabelaz, kontrola"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Zrušit
          </Button>
          <Button onClick={submit} disabled={!title.trim()}>
            Vytvořit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KanbanCard({
  task,
  assigneeName,
  members,
  onDragStart,
  onDragEnd,
  onDelete,
  onEdit,
  onAddCp,
  onToggleCp,
  onDeleteCp,
  onStatusChange,
}: {
  task: Task;
  assigneeName: string | null | undefined;
  members: Array<{ id: string; name: string }>;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDelete: () => void;
  onEdit: (patch: Partial<Task>) => void;
  onAddCp: (label: string) => void;
  onToggleCp: (id: string, done: boolean) => void;
  onDeleteCp: (id: string) => void;
  onStatusChange: (status: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [cpLabel, setCpLabel] = useState("");
  const prio = PRIORITY_META[task.priority] ?? PRIORITY_META.NORMAL;
  const doneCps = task.checkpoints.filter((c) => c.done).length;
  const totalCps = task.checkpoints.length;
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className="group relative cursor-grab rounded-md border border-border/60 bg-card/80 p-2.5 shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:cursor-grabbing"
    >
      <div className="mb-1.5 flex items-start gap-1.5">
        <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/50" />
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium leading-snug">{task.title}</div>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      <div className="mb-1.5" onPointerDown={(e) => e.stopPropagation()}>
        <Select value={task.status} onValueChange={(v) => onStatusChange(v as any)}>
          <SelectTrigger className="h-7 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_COLUMNS.map((c) => (
              <SelectItem key={c.key} value={c.key} className="text-xs">
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-1.5 flex flex-wrap items-center gap-1">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
            prio.className,
          )}
        >
          <Flag className="h-2.5 w-2.5" />
          {prio.label}
        </span>
        {task.defectId && (
          <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-red-300">
            <AlertTriangle className="h-2.5 w-2.5" />
            Závada
          </span>
        )}
        {task.labels.slice(0, 3).map((lb) => (
          <span
            key={lb}
            className="rounded-sm border border-border/40 bg-muted/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground"
          >
            {lb}
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1.5">
          {assigneeName ? (
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 font-mono text-[9px] font-semibold text-primary">
              {assigneeName.slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <span className="text-muted-foreground italic">Nepřiřazeno</span>
          )}
          {task.dueDate && (
            <span className={cn("font-mono", overdue ? "text-red-400" : "text-muted-foreground")}>
              {task.dueDate}
            </span>
          )}
        </div>
        {totalCps > 0 && (
          <span className="font-mono text-muted-foreground">
            {doneCps}/{totalCps}
          </span>
        )}
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-1.5 w-full rounded-sm border-t border-border/30 pt-1.5 text-center font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70 hover:text-foreground"
      >
        {expanded ? "Skrýt" : "Detail"}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
          {task.description && (
            <p className="whitespace-pre-wrap text-xs text-muted-foreground">{task.description}</p>
          )}
          {task.checkpoints.length > 0 && (
            <div className="space-y-1">
              {task.checkpoints.map((c) => (
                <div key={c.id} className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={c.done}
                    onCheckedChange={(v) => onToggleCp(c.id, Boolean(v))}
                  />
                  <span className={cn(c.done && "line-through text-muted-foreground")}>
                    {c.label}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto h-4 w-4"
                    onClick={() => onDeleteCp(c.id)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <Input
              value={cpLabel}
              onChange={(e) => setCpLabel(e.target.value)}
              placeholder="Přidat pod-úkol…"
              className="h-6 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && cpLabel.trim()) {
                  onAddCp(cpLabel.trim());
                  setCpLabel("");
                }
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <Select
              value={task.priority}
              onValueChange={(v) => onEdit({ priority: v })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Nízká</SelectItem>
                <SelectItem value="NORMAL">Normální</SelectItem>
                <SelectItem value="HIGH">Vysoká</SelectItem>
                <SelectItem value="URGENT">Kritická</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={task.assignedTo || "__none"}
              onValueChange={(v) => onEdit({ assignedTo: v === "__none" ? null : v })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Přiřadit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Nepřiřazeno</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

// ================ PHOTOS ================
function PhotosTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchPhotos = useServerFn(listLobbyPhotos);
  const createRecord = useServerFn(createLobbyPhotoRecord);
  const deleteFn = useServerFn(deleteLobbyPhoto);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const photos = useQuery({
    queryKey: ["lobby-photos", projectId],
    queryFn: () => fetchPhotos({ data: { projectId } }),
  });

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) throw new Error("Nepřihlášen");
        const path = `${projectId}/${uid}/${crypto.randomUUID()}-${file.name}`;
        const up = await supabase.storage
          .from("project-lobby-photos")
          .upload(path, file, { upsert: false });
        if (up.error) throw new Error(up.error.message);
        await createRecord({ data: { projectId, storagePath: path, caption: null } });
      }
      qc.invalidateQueries({ queryKey: ["lobby-photos", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nahrání selhalo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-xs text-muted-foreground">
          Celkem: {photos.data?.length ?? 0}
        </div>
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <Plus className="mr-1 h-4 w-4" /> {uploading ? "Nahrávám…" : "Nahrát fotky"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => onUpload(e.target.files)}
        />
      </div>

      {photos.data && photos.data.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/40 p-12 text-center text-sm text-muted-foreground">
          Zatím žádné fotky.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {(photos.data ?? []).map((p) => (
          <div
            key={p.id}
            className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-black/40"
          >
            {p.url ? (
              <img src={p.url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs">…</div>
            )}
            <button
              onClick={async () => {
                if (!confirm("Smazat fotku?")) return;
                await deleteFn({ data: { id: p.id } });
                qc.invalidateQueries({ queryKey: ["lobby-photos", projectId] });
              }}
              className="absolute right-1 top-1 rounded-full bg-black/70 p-1 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3 text-white" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[10px] text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
              {new Date(p.createdAt).toLocaleString("cs-CZ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
