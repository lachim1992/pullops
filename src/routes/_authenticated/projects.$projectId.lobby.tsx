import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, ListChecks, Camera, Send, Plus, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  deleteTask,
  upsertCheckpoint,
  toggleCheckpoint,
  deleteCheckpoint,
  listLobbyPhotos,
  createLobbyPhotoRecord,
  deleteLobbyPhoto,
} from "@/lib/lobby.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projects/$projectId/lobby")({
  head: () => ({ meta: [{ title: "Lobby · PullOps" }, { name: "robots", content: "noindex" }] }),
  component: LobbyPage,
});

function LobbyPage() {
  const { projectId } = Route.useParams();
  return (
    <AppShell projectId={projectId}>
      <div className="animate-fade-in space-y-6">
        <header>
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Projekt / Lobby
          </div>
          <h1 className="mt-1 font-mono text-2xl font-bold">Lobby</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Komunikace, úkoly a fotodokumentace projektu.
          </p>
        </header>

        <Tabs defaultValue="chat" className="w-full">
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
function ChatTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchMsgs = useServerFn(listChatMessages);
  const sendFn = useServerFn(sendChatMessage);
  const delFn = useServerFn(deleteChatMessage);
  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const msgs = useQuery({
    queryKey: ["chat", projectId],
    queryFn: () => fetchMsgs({ data: { projectId, limit: 200 } }),
    refetchInterval: 5000,
  });

  useEffect(() => {
    const ch = supabase
      .channel(`chat:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_chat_messages", filter: `project_id=eq.${projectId}` },
        () => qc.invalidateQueries({ queryKey: ["chat", projectId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [projectId, qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs.data?.length]);

  async function onSend() {
    const b = body.trim();
    if (!b) return;
    setBody("");
    try {
      await sendFn({ data: { projectId, body: b } });
      qc.invalidateQueries({ queryKey: ["chat", projectId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
      setBody(b);
    }
  }

  return (
    <Card className="border-border/60">
      <CardContent className="p-0">
        <div ref={scrollRef} className="h-[420px] overflow-y-auto p-4 space-y-3">
          {(msgs.data ?? []).length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-16">
              Zatím žádné zprávy. Napište první.
            </div>
          )}
          {(msgs.data ?? []).map((m) => (
            <div key={m.id} className="group flex gap-3 animate-fade-in">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs text-primary">
                {m.authorName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs font-semibold">{m.authorName}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(m.createdAt).toLocaleString("cs-CZ")}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={async () => {
                      await delFn({ data: { id: m.id } });
                      qc.invalidateQueries({ queryKey: ["chat", projectId] });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 border-t border-border/60 p-3">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Napište zprávu…"
            className="font-mono"
          />
          <Button onClick={onSend} disabled={!body.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ================ TASKS ================
function TasksTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const fetchTasks = useServerFn(listTasks);
  const upsertFn = useServerFn(upsertTask);
  const deleteFn = useServerFn(deleteTask);
  const upsertCp = useServerFn(upsertCheckpoint);
  const toggleCp = useServerFn(toggleCheckpoint);
  const deleteCp = useServerFn(deleteCheckpoint);

  const tasks = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => fetchTasks({ data: { projectId } }),
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");

  async function onCreate() {
    if (!title.trim()) return;
    await upsertFn({
      data: {
        projectId,
        title: title.trim(),
        description: description || null,
        dueDate: dueDate || null,
        status: "TODO",
      },
    });
    setTitle("");
    setDescription("");
    setDueDate("");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
  }

  const groups: Array<{ key: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED"; label: string; tone: string }> = [
    { key: "TODO", label: "K řešení", tone: "bg-muted" },
    { key: "IN_PROGRESS", label: "Probíhá", tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { key: "DONE", label: "Hotovo", tone: "bg-green-500/10 text-green-700 dark:text-green-400" },
    { key: "CANCELLED", label: "Zrušeno", tone: "bg-muted text-muted-foreground" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-xs text-muted-foreground">
          Celkem: {tasks.data?.length ?? 0}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> Nový úkol
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nový úkol</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Název</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Popis</label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-mono uppercase text-muted-foreground">Termín</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Zrušit
              </Button>
              <Button onClick={onCreate} disabled={!title.trim()}>
                Vytvořit
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {groups.map((g) => {
          const items = (tasks.data ?? []).filter((t) => t.status === g.key);
          return (
            <div key={g.key} className="space-y-2">
              <div className={cn("rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-widest", g.tone)}>
                {g.label} · {items.length}
              </div>
              <div className="space-y-2">
                {items.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    onStatus={async (status) => {
                      await upsertFn({
                        data: {
                          id: t.id,
                          projectId,
                          title: t.title,
                          description: t.description,
                          dueDate: t.dueDate,
                          status,
                        },
                      });
                      qc.invalidateQueries({ queryKey: ["tasks", projectId] });
                    }}
                    onDelete={async () => {
                      await deleteFn({ data: { id: t.id } });
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
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onStatus,
  onDelete,
  onAddCp,
  onToggleCp,
  onDeleteCp,
}: {
  task: any;
  onStatus: (s: "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED") => void;
  onDelete: () => void;
  onAddCp: (label: string) => void;
  onToggleCp: (id: string, done: boolean) => void;
  onDeleteCp: (id: string) => void;
}) {
  const [cpLabel, setCpLabel] = useState("");
  return (
    <Card className="animate-fade-in border-border/60 transition-all hover:border-primary/40 hover:shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm">{task.title}</CardTitle>
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        {task.dueDate && (
          <Badge variant="outline" className="w-fit font-mono text-[10px]">
            {task.dueDate}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {task.description && (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">{task.description}</p>
        )}
        {task.checkpoints?.length > 0 && (
          <div className="space-y-1">
            {task.checkpoints.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 text-xs">
                <Checkbox checked={c.done} onCheckedChange={(v) => onToggleCp(c.id, Boolean(v))} />
                <span className={cn(c.done && "line-through text-muted-foreground")}>{c.label}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto h-5 w-5"
                  onClick={() => onDeleteCp(c.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <Input
            value={cpLabel}
            onChange={(e) => setCpLabel(e.target.value)}
            placeholder="Pod-checkpoint…"
            className="h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Enter" && cpLabel.trim()) {
                onAddCp(cpLabel.trim());
                setCpLabel("");
              }
            }}
          />
        </div>
        <div className="flex flex-wrap gap-1 pt-1">
          {(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const)
            .filter((s) => s !== task.status)
            .map((s) => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className="h-6 px-2 font-mono text-[10px]"
                onClick={() => onStatus(s)}
              >
                → {s}
              </Button>
            ))}
        </div>
      </CardContent>
    </Card>
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
        const path = `${uid}/${projectId}/${crypto.randomUUID()}-${file.name}`;
        const up = await supabase.storage.from("project-lobby-photos").upload(path, file, {
          upsert: false,
        });
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
          className="hidden"
          onChange={(e) => onUpload(e.target.files)}
        />
      </div>

      {(photos.data ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed p-12 text-center text-sm text-muted-foreground">
          Žádné fotky. Klikněte na „Nahrát fotky".
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {(photos.data ?? []).map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-muted animate-fade-in">
              {p.url && (
                <img src={p.url} alt={p.caption ?? ""} className="h-full w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
              )}
              <Button
                size="icon"
                variant="destructive"
                className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={async () => {
                  await deleteFn({ data: { id: p.id } });
                  qc.invalidateQueries({ queryKey: ["lobby-photos", projectId] });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
