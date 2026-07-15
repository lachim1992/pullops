import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  FileDown,
  Flag,
  Info,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  listDefects,
  getDefect,
  upsertDefect,
  setDefectStatus,
  assignDefect,
  addDefectComment,
  registerDefectPhoto,
  deleteDefectPhoto,
  convertDefectToTask,
  deleteDefect,
  listProjectMembersLite,
} from "@/lib/defects.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projects/$projectId/defects")({
  validateSearch: (s: Record<string, unknown>) => ({
    focus: typeof s.focus === "string" ? s.focus : undefined,
  }),
  head: () => ({
    meta: [{ title: "Závady · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: DefectsPage,
});


type Severity = "INFO" | "DEFECT" | "CRITICAL";
type Status = "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "REJECTED";

const SEVERITY_META: Record<Severity, { label: string; icon: any; className: string }> = {
  INFO: { label: "Oznámení", icon: Info, className: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  DEFECT: { label: "Závada", icon: AlertTriangle, className: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  CRITICAL: { label: "Kritické", icon: Flag, className: "border-red-500/50 bg-red-500/15 text-red-300" },
};

const STATUS_META: Record<Status, { label: string; className: string }> = {
  OPEN: { label: "Otevřeno", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  IN_PROGRESS: { label: "Řeší se", className: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  WAITING: { label: "Čeká", className: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  RESOLVED: { label: "Vyřešeno", className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  REJECTED: { label: "Zamítnuto", className: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
};

function DefectsPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fetchList = useServerFn(listDefects);
  const fetchMembers = useServerFn(listProjectMembersLite);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"ALL" | Severity>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN_ONLY" | Status>("OPEN_ONLY");
  const [createOpen, setCreateOpen] = useState(false);

  const list = useQuery({
    queryKey: ["defects", projectId],
    queryFn: () => fetchList({ data: { projectId } }),
  });
  const members = useQuery({
    queryKey: ["defects", "members", projectId],
    queryFn: () => fetchMembers({ data: { projectId } }),
  });
  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of members.data ?? []) m.set(it.id, it.name);
    return m;
  }, [members.data]);

  const filtered = useMemo(() => {
    return (list.data ?? []).filter((d: any) => {
      if (severityFilter !== "ALL" && d.severity !== severityFilter) return false;
      if (statusFilter === "OPEN_ONLY") {
        if (d.status === "RESOLVED" || d.status === "REJECTED") return false;
      } else if (statusFilter !== "ALL") {
        if (d.status !== statusFilter) return false;
      }
      return true;
    });
  }, [list.data, severityFilter, statusFilter]);

  const counts = useMemo(() => {
    const all = list.data ?? [];
    return {
      open: all.filter((d: any) => d.status !== "RESOLVED" && d.status !== "REJECTED").length,
      critical: all.filter((d: any) => d.severity === "CRITICAL" && d.status !== "RESOLVED").length,
      resolved: all.filter((d: any) => d.status === "RESOLVED").length,
      total: all.length,
    };
  }, [list.data]);

  return (
    <AppShell projectId={projectId}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
            Pull mode / Quality
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Závady</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nahlaste závadu na kabel, endpoint nebo cokoli jiného. Fotky, komentáře, přiřazení a konverze na úkol.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="bg-[color:var(--accent)] text-primary-foreground hover:bg-[color:var(--accent)]/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          Nahlásit závadu
        </Button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Celkem" value={counts.total} />
        <StatTile label="Otevřených" value={counts.open} tone="warn" />
        <StatTile label="Kritických" value={counts.critical} tone="crit" />
        <StatTile label="Vyřešeno" value={counts.resolved} tone="ok" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* LEFT: list */}
        <Card className="card-noir">
          <CardHeader className="flex flex-col gap-2 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="font-display text-sm">Seznam</CardTitle>
              <span className="font-mono text-[10px] text-muted-foreground">{filtered.length}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={severityFilter === "ALL"} onClick={() => setSeverityFilter("ALL")}>
                Vše
              </FilterChip>
              {(["INFO", "DEFECT", "CRITICAL"] as const).map((s) => (
                <FilterChip key={s} active={severityFilter === s} onClick={() => setSeverityFilter(s)}>
                  {SEVERITY_META[s].label}
                </FilterChip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={statusFilter === "OPEN_ONLY"} onClick={() => setStatusFilter("OPEN_ONLY")}>
                Otevřené
              </FilterChip>
              <FilterChip active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")}>
                Vše
              </FilterChip>
              <FilterChip active={statusFilter === "RESOLVED"} onClick={() => setStatusFilter("RESOLVED")}>
                Vyřešené
              </FilterChip>
            </div>
          </CardHeader>
          <CardContent className="max-h-[640px] space-y-1.5 overflow-y-auto p-2">
            {list.isLoading && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </div>
            )}
            {filtered.map((d: any) => {
              const sev = SEVERITY_META[d.severity as Severity];
              const st = STATUS_META[d.status as Status];
              const SevIcon = sev.icon;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={cn(
                    "block w-full rounded-md border border-transparent p-2.5 text-left transition-all",
                    "hover:border-[color:var(--accent)]/30 hover:bg-accent/20",
                    selectedId === d.id && "border-[color:var(--accent)]/50 bg-accent/25",
                  )}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider", sev.className)}>
                      <SevIcon className="h-3 w-3" /> {sev.label}
                    </span>
                    <span className={cn("rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider", st.className)}>
                      {st.label}
                    </span>
                  </div>
                  <div className="line-clamp-1 text-sm font-medium">{d.title}</div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{d.assigned_to ? memberMap.get(d.assigned_to) ?? "—" : "Nepřiřazeno"}</span>
                    <span className="font-mono">{new Date(d.created_at).toLocaleDateString("cs")}</span>
                  </div>
                </button>
              );
            })}
            {!list.isLoading && filtered.length === 0 && (
              <div className="p-6 text-center text-xs text-muted-foreground">Žádné závady tohoto typu.</div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: detail */}
        <div>
          {selectedId ? (
            <DefectDetail
              defectId={selectedId}
              projectId={projectId}
              members={members.data ?? []}
              memberMap={memberMap}
              onClose={() => setSelectedId(null)}
              onDeleted={() => {
                setSelectedId(null);
                qc.invalidateQueries({ queryKey: ["defects", projectId] });
              }}
            />
          ) : (
            <Card className="card-noir">
              <CardContent className="flex min-h-[400px] flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                <ChevronRight className="h-8 w-8 opacity-30" />
                <div className="font-display text-sm">Vyberte závadu ze seznamu</div>
                <div className="text-xs">Nebo nahlaste novou tlačítkem výše.</div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <CreateDefectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={projectId}
        members={members.data ?? []}
      />
    </AppShell>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone?: "warn" | "crit" | "ok" }) {
  const toneCls =
    tone === "crit"
      ? "text-red-300"
      : tone === "warn"
        ? "text-amber-300"
        : tone === "ok"
          ? "text-emerald-300"
          : "text-foreground";
  return (
    <div className="card-noir rounded-lg border border-border/40 bg-card/60 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-semibold", toneCls)}>{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors",
        active
          ? "border-[color:var(--accent)]/60 bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
          : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CreateDefectDialog({
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
  const upsert = useServerFn(upsertDefect);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("DEFECT");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await upsert({
        data: {
          projectId,
          title: title.trim(),
          description: description.trim() || null,
          severity,
          assignedTo: assignedTo || null,
        },
      });
      toast.success("Závada nahlášena");
      qc.invalidateQueries({ queryKey: ["defects", projectId] });
      setTitle("");
      setDescription("");
      setSeverity("DEFECT");
      setAssignedTo("");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Nahlásit závadu</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Nadpis</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Krátký popis problému" />
          </div>
          <div className="space-y-1.5">
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Popis</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Detaily, kontext, co se stalo…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Závažnost</label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as Severity)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INFO">Oznámení</SelectItem>
                  <SelectItem value="DEFECT">Závada</SelectItem>
                  <SelectItem value="CRITICAL">Kritické</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Přiřadit</label>
              <Select value={assignedTo || "__none"} onValueChange={(v) => setAssignedTo(v === "__none" ? "" : v)}>
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
          </div>
          {severity === "CRITICAL" && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-200">
              <Flag className="mr-1 inline h-3 w-3" />
              Kritická závada automaticky vytvoří úkol s prioritou URGENT.
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Zrušit
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !title.trim()}
            className="bg-[color:var(--accent)] text-primary-foreground hover:bg-[color:var(--accent)]/90"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Nahlásit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DefectDetail({
  defectId,
  projectId,
  members,
  memberMap,
  onClose,
  onDeleted,
}: {
  defectId: string;
  projectId: string;
  members: Array<{ id: string; name: string }>;
  memberMap: Map<string, string>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getDefect);
  const setStatus = useServerFn(setDefectStatus);
  const assign = useServerFn(assignDefect);
  const addComment = useServerFn(addDefectComment);
  const registerPhoto = useServerFn(registerDefectPhoto);
  const deletePhoto = useServerFn(deleteDefectPhoto);
  const convert = useServerFn(convertDefectToTask);
  const delDefect = useServerFn(deleteDefect);

  const detail = useQuery({
    queryKey: ["defects", "detail", defectId],
    queryFn: () => fetchDetail({ data: { id: defectId } }),
  });

  const [comment, setComment] = useState("");
  const [resNote, setResNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["defects", "detail", defectId] });
    qc.invalidateQueries({ queryKey: ["defects", projectId] });
  };

  async function onFilePick(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${projectId}/${defectId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("defect-photos").upload(path, file, {
          contentType: file.type || "image/jpeg",
          upsert: false,
        });
        if (error) throw error;
        await registerPhoto({ data: { defectId, storagePath: path, caption: null } });
      }
      toast.success("Fotky nahrány");
      invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba nahrávání");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (detail.isLoading || !detail.data) {
    return (
      <Card className="card-noir">
        <CardContent className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const def = detail.data.defect;
  const sev = SEVERITY_META[def.severity as Severity];
  const st = STATUS_META[def.status as Status];
  const SevIcon = sev.icon;

  return (
    <Card className="card-noir">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wider", sev.className)}>
              <SevIcon className="h-3.5 w-3.5" />
              {sev.label}
            </span>
            <span className={cn("rounded border px-2 py-0.5 text-xs uppercase tracking-wider", st.className)}>
              {st.label}
            </span>
          </div>
          <CardTitle className="font-display text-xl leading-tight">{def.title}</CardTitle>
          {def.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{def.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Actions row */}
        <div className="flex flex-wrap gap-2">
          <Select
            value={def.status}
            onValueChange={async (v) => {
              await setStatus({ data: { id: def.id, status: v as Status, resolutionNote: resNote || null } });
              toast.success("Stav aktualizován");
              invalidate();
            }}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">Otevřeno</SelectItem>
              <SelectItem value="IN_PROGRESS">Řeší se</SelectItem>
              <SelectItem value="WAITING">Čeká</SelectItem>
              <SelectItem value="RESOLVED">Vyřešeno</SelectItem>
              <SelectItem value="REJECTED">Zamítnuto</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={def.assigned_to || "__none"}
            onValueChange={async (v) => {
              await assign({ data: { id: def.id, assignedTo: v === "__none" ? null : v } });
              invalidate();
            }}
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <UserPlus className="mr-1 h-3 w-3" />
              <SelectValue placeholder="Přiřadit" />
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

          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await convert({ data: { defectId: def.id } });
                toast.success("Úkol vytvořen");
              } catch (e: any) {
                toast.error(e?.message ?? "Chyba");
              }
            }}
          >
            <ArrowRight className="mr-1 h-3 w-3" />
            Vytvořit úkol
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportDefectProtocol({
                defect: def,
                photos: detail.data!.photos,
                comments: detail.data!.comments,
                assigneeName: def.assigned_to ? memberMap.get(def.assigned_to) ?? null : null,
              })
            }
          >
            <FileDown className="mr-1 h-3 w-3" />
            Export protokol (PDF)
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-red-300 hover:bg-red-500/10 hover:text-red-200"
            onClick={async () => {
              if (!confirm("Smazat závadu?")) return;
              await delDefect({ data: { id: def.id } });
              toast.success("Smazáno");
              onDeleted();
            }}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Smazat
          </Button>
        </div>

        {/* Photos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Fotografie ({detail.data.photos.length})
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Camera className="mr-1 h-3 w-3" />}
              Přidat foto
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => onFilePick(e.target.files)}
            />
          </div>
          {detail.data.photos.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
              Žádné fotky. Přidejte doklad k závadě.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {detail.data.photos.map((p) => (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md border border-border/40 bg-black/40">
                  {p.url ? (
                    <img src={p.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">…</div>
                  )}
                  <button
                    onClick={async () => {
                      if (!confirm("Smazat fotku?")) return;
                      await deletePhoto({ data: { id: p.id } });
                      invalidate();
                    }}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Resolution note when resolving */}
        {(def.status === "IN_PROGRESS" || def.status === "WAITING") && (
          <div className="rounded-md border border-border/40 bg-card/50 p-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Poznámka k vyřešení
            </div>
            <Textarea
              value={resNote}
              onChange={(e) => setResNote(e.target.value)}
              rows={2}
              placeholder="Jak byla závada vyřešena…"
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                onClick={async () => {
                  await setStatus({ data: { id: def.id, status: "RESOLVED", resolutionNote: resNote || null } });
                  setResNote("");
                  invalidate();
                }}
                className="bg-emerald-600/80 hover:bg-emerald-600"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Označit jako vyřešené
              </Button>
            </div>
          </div>
        )}

        {def.resolution_note && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300">
              Řešení
            </div>
            <div className="whitespace-pre-wrap text-emerald-100/80">{def.resolution_note}</div>
          </div>
        )}

        {/* Comments */}
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Diskuze ({detail.data.comments.length})
          </div>
          <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
            {detail.data.comments.length === 0 && (
              <div className="rounded-md border border-dashed border-border/40 p-3 text-center text-xs text-muted-foreground">
                Zatím žádné komentáře.
              </div>
            )}
            {detail.data.comments.map((c) => (
              <div key={c.id} className="rounded-md border border-border/30 bg-card/50 px-3 py-2">
                <div className="mb-0.5 flex items-center justify-between">
                  <div className="text-xs font-semibold text-[color:var(--accent)]">{c.authorName}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString("cs")}
                  </div>
                </div>
                <div className="whitespace-pre-wrap text-sm">{c.body}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Napsat komentář…"
              onKeyDown={async (e) => {
                if (e.key === "Enter" && !e.shiftKey && comment.trim()) {
                  e.preventDefault();
                  await addComment({ data: { defectId: def.id, body: comment.trim() } });
                  setComment("");
                  invalidate();
                }
              }}
            />
            <Button
              size="icon"
              onClick={async () => {
                if (!comment.trim()) return;
                await addComment({ data: { defectId: def.id, body: comment.trim() } });
                setComment("");
                invalidate();
              }}
              className="shrink-0 bg-[color:var(--accent)] text-primary-foreground hover:bg-[color:var(--accent)]/90"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ================ PDF EXPORT ================
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function exportDefectProtocol(input: {
  defect: any;
  photos: Array<{ id: string; url: string | null; caption: string | null }>;
  comments: Array<{ id: string; body: string; authorName: string; createdAt: string }>;
  assigneeName: string | null;
}) {
  const { defect, photos, comments, assigneeName } = input;
  const sev = SEVERITY_META[defect.severity as Severity];
  const st = STATUS_META[defect.status as Status];
  const created = new Date(defect.created_at).toLocaleString("cs-CZ");
  const resolved = defect.resolved_at ? new Date(defect.resolved_at).toLocaleString("cs-CZ") : null;

  const photosHtml = photos
    .filter((p) => p.url)
    .map(
      (p) =>
        `<div class="photo"><img src="${escapeHtml(p.url!)}" alt="" />${
          p.caption ? `<div class="cap">${escapeHtml(p.caption)}</div>` : ""
        }</div>`,
    )
    .join("");

  const commentsHtml = comments.length
    ? comments
        .map(
          (c) =>
            `<div class="comment"><div class="meta"><strong>${escapeHtml(
              c.authorName,
            )}</strong> · ${new Date(c.createdAt).toLocaleString("cs-CZ")}</div><div>${escapeHtml(
              c.body,
            )}</div></div>`,
        )
        .join("")
    : '<div class="empty">Bez komentářů.</div>';

  const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"/>
<title>Protokol závady · ${escapeHtml(defect.title)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; color: #111; line-height: 1.5; margin: 0; padding: 20px; }
  h1 { font-family: 'Space Grotesk', system-ui, sans-serif; font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-family: 'Space Grotesk', system-ui, sans-serif; font-size: 14px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.15em; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .brand { font-family: 'Space Grotesk'; font-weight: 700; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #b8860b; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 12px; margin: 8px 0 12px; }
  .meta-grid div span:first-child { color: #666; text-transform: uppercase; font-size: 9px; letter-spacing: 0.15em; display: block; margin-bottom: 2px; font-family: 'Space Grotesk'; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; border: 1px solid; margin-right: 4px; }
  .sev-INFO { background: #e0f2fe; color: #075985; border-color: #7dd3fc; }
  .sev-DEFECT { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
  .sev-CRITICAL { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
  .status { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
  .description { background: #f9fafb; padding: 12px; border-left: 3px solid #b8860b; font-size: 12px; }
  .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .photo { border: 1px solid #ddd; border-radius: 4px; overflow: hidden; page-break-inside: avoid; }
  .photo img { width: 100%; height: 220px; object-fit: cover; display: block; }
  .photo .cap { padding: 4px 8px; font-size: 10px; color: #666; }
  .comment { border-left: 2px solid #e5e7eb; padding: 6px 0 6px 10px; margin-bottom: 8px; font-size: 12px; page-break-inside: avoid; }
  .comment .meta { font-size: 10px; color: #666; margin-bottom: 2px; }
  .empty { color: #999; font-style: italic; font-size: 12px; }
  .resolution { background: #ecfdf5; border-left: 3px solid #10b981; padding: 12px; font-size: 12px; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; color: #666; text-align: center; font-family: 'Space Grotesk'; letter-spacing: 0.1em; text-transform: uppercase; }
  @media print { button { display: none; } body { padding: 0; } }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="brand">PullOps · Protokol závady</div>
      <h1>${escapeHtml(defect.title)}</h1>
      <div style="margin-top:6px">
        <span class="badge sev-${defect.severity}">${escapeHtml(sev.label)}</span>
        <span class="badge status">${escapeHtml(st.label)}</span>
      </div>
    </div>
    <div style="text-align:right; font-size:10px; color:#666; font-family:'Space Grotesk'">
      <div>Vygenerováno</div>
      <div style="color:#111; font-weight:600">${new Date().toLocaleString("cs-CZ")}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div><span>Vytvořeno</span><span>${escapeHtml(created)}</span></div>
    <div><span>Přiřazeno</span><span>${escapeHtml(assigneeName ?? "Nepřiřazeno")}</span></div>
    <div><span>ID</span><span style="font-family:monospace">${escapeHtml(defect.id)}</span></div>
    <div><span>Vyřešeno</span><span>${escapeHtml(resolved ?? "—")}</span></div>
  </div>

  ${
    defect.description
      ? `<h2>Popis</h2><div class="description">${escapeHtml(defect.description)}</div>`
      : ""
  }

  ${
    defect.resolution_note
      ? `<h2>Řešení</h2><div class="resolution">${escapeHtml(defect.resolution_note)}</div>`
      : ""
  }

  ${photosHtml ? `<h2>Fotodokumentace (${photos.length})</h2><div class="photos">${photosHtml}</div>` : ""}

  <h2>Diskuze (${comments.length})</h2>
  ${commentsHtml}

  <div class="footer">PullOps · ${new Date().getFullYear()}</div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function(){ window.print(); }, 400);
    });
  </script>
</body></html>`;

  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) {
    toast.error("Prohlížeč zablokoval otevření okna");
    return;
  }
  w.document.write(html);
  w.document.close();
}
