import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FileText,
  Plus,
  Camera,
  Trash2,
  Loader2,
  CheckCircle2,
  RotateCcw,
  Download,
  X,
  MapPin,
  Users,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  listProtocols,
  getProtocol,
  createProtocol,
  updateProtocol,
  finalizeProtocol,
  reopenProtocol,
  deleteProtocol,
  registerProtocolPhoto,
  deleteProtocolPhoto,
} from "@/lib/protocols.functions";
import { listFloorPlans } from "@/lib/floorPlans.functions";
import { getMyProjectCapabilities } from "@/lib/capabilities.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projects/$projectId/protocols")({
  head: () => ({
    meta: [{ title: "Protokoly · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: ProtocolsPage,
});

function ProtocolsPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const listFn = useServerFn(listProtocols);
  const capsFn = useServerFn(getMyProjectCapabilities);

  const list = useQuery({
    queryKey: ["protocols", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const caps = useQuery({
    queryKey: ["capabilities", "project", projectId],
    queryFn: () => capsFn({ data: { projectId } }),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const items = list.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["protocols", projectId] });

  return (
    <AppShell projectId={projectId}>
      <div className="animate-fade-in space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
              Projekt / Protokoly
            </div>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Protokoly</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Záznamy o situacích na projektu s časem, fotkami a podpisem. Exportovatelné do PDF.
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> Nový protokol
              </Button>
            </DialogTrigger>
            <CreateProtocolDialog
              projectId={projectId}
              onCreated={(id) => {
                setCreateOpen(false);
                invalidate();
                setSelectedId(id);
              }}
            />
          </Dialog>
        </header>

        <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
          {/* List */}
          <Card className="border-border/60">
            <CardContent className="p-0">
              <div className="border-b border-border/60 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {items.length} {items.length === 1 ? "protokol" : items.length >= 2 && items.length <= 4 ? "protokoly" : "protokolů"}
              </div>
              {list.isLoading && (
                <div className="p-6 text-center text-xs text-muted-foreground">Načítám…</div>
              )}
              {!list.isLoading && items.length === 0 && (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  Zatím žádný protokol. Vytvořte první kliknutím na „Nový protokol".
                </div>
              )}
              <div className="max-h-[calc(100vh-260px)] overflow-y-auto divide-y divide-border/40">
                {items.map((it: any) => (
                  <button
                    key={it.id}
                    onClick={() => setSelectedId(it.id)}
                    className={cn(
                      "w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/40",
                      selectedId === it.id && "bg-muted/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {it.reference_number}
                      </span>
                      <StatusBadge status={it.status} />
                    </div>
                    <div className="mt-1 truncate font-display text-sm font-medium">{it.title}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(it.created_at).toLocaleString("cs-CZ", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {it.photo_count > 0 && (
                        <>
                          <span className="mx-1">·</span>
                          <Camera className="h-3 w-3" />
                          {it.photo_count}
                        </>
                      )}
                      {it.author_name && (
                        <>
                          <span className="mx-1">·</span>
                          <span className="truncate">{it.author_name}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Detail */}
          <div>
            {selectedId ? (
              <ProtocolDetail
                key={selectedId}
                projectId={projectId}
                protocolId={selectedId}
                canManage={caps.data?.canManage ?? false}
                onChanged={invalidate}
                onDeleted={() => {
                  setSelectedId(null);
                  invalidate();
                }}
              />
            ) : (
              <Card className="border-dashed border-border/60 h-full">
                <CardContent className="flex flex-col items-center justify-center py-24 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mb-3 opacity-50" />
                  <div className="font-display text-sm">Vyberte protokol ze seznamu</div>
                  <div className="mt-1 text-xs">nebo vytvořte nový</div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "FINALIZED") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20 font-mono text-[9px] uppercase tracking-widest">
        Podepsáno
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-widest">
      Rozpracováno
    </Badge>
  );
}

// ================= CREATE =================
function CreateProtocolDialog({
  projectId,
  onCreated,
}: {
  projectId: string;
  onCreated: (id: string) => void;
}) {
  const create = useServerFn(createProtocol);
  const listFp = useServerFn(listFloorPlans);
  const fps = useQuery({
    queryKey: ["floor-plans", projectId],
    queryFn: () => listFp({ data: { projectId } }),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [locationNote, setLocationNote] = useState("");
  const [floorPlanId, setFloorPlanId] = useState<string>("");
  const [participants, setParticipants] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const t = title.trim();
    if (!t) {
      toast.error("Zadejte název protokolu");
      return;
    }
    setBusy(true);
    try {
      const res = await create({
        data: {
          projectId,
          title: t,
          description: description.trim() || null,
          locationNote: locationNote.trim() || null,
          floorPlanId: floorPlanId || null,
          participants: participants.trim() || null,
        },
      });
      toast.success(`Protokol ${res.reference_number} vytvořen`);
      setTitle("");
      setDescription("");
      setLocationNote("");
      setFloorPlanId("");
      setParticipants("");
      onCreated(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="font-display">Nový protokol</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Název *
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Např. Předání kabeláže první patro"
            maxLength={200}
            className="mt-1"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Popis situace
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailní popis situace, průběhu, důvodů…"
            rows={4}
            maxLength={10000}
            className="mt-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Patro / půdorys
            </label>
            <Select value={floorPlanId} onValueChange={setFloorPlanId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Nevázáno" />
              </SelectTrigger>
              <SelectContent>
                {(fps.data ?? []).map((fp: any) => (
                  <SelectItem key={fp.id} value={fp.id}>
                    {fp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Konkrétní místo
            </label>
            <Input
              value={locationNote}
              onChange={(e) => setLocationNote(e.target.value)}
              placeholder="Např. rack A, pokladna 2…"
              maxLength={500}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Účastníci
          </label>
          <Input
            value={participants}
            onChange={(e) => setParticipants(e.target.value)}
            placeholder="Např. J. Novák (technik), P. Svoboda (zákazník)"
            maxLength={1000}
            className="mt-1"
          />
        </div>
      </div>
      <DialogFooter>
        <Button onClick={submit} disabled={busy || !title.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Vytvořit
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ================= DETAIL =================
function ProtocolDetail({
  projectId,
  protocolId,
  canManage,
  onChanged,
  onDeleted,
}: {
  projectId: string;
  protocolId: string;
  canManage: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getProtocol);
  const listFp = useServerFn(listFloorPlans);
  const update = useServerFn(updateProtocol);
  const finalize = useServerFn(finalizeProtocol);
  const reopen = useServerFn(reopenProtocol);
  const del = useServerFn(deleteProtocol);
  const registerPhoto = useServerFn(registerProtocolPhoto);
  const delPhoto = useServerFn(deleteProtocolPhoto);

  const detail = useQuery({
    queryKey: ["protocols", "detail", protocolId],
    queryFn: () => fetchDetail({ data: { id: protocolId } }),
  });
  const fps = useQuery({
    queryKey: ["floor-plans", projectId],
    queryFn: () => listFp({ data: { projectId } }),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [signedByName, setSignedByName] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["protocols", "detail", protocolId] });
    onChanged();
  };

  if (detail.isLoading) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-8 text-center text-xs text-muted-foreground">Načítám…</CardContent>
      </Card>
    );
  }
  if (!detail.data) return null;

  const p = detail.data.protocol as any;
  const photos = detail.data.photos;
  const isFinalized = p.status === "FINALIZED";
  const canEdit = !isFinalized || canManage;

  async function saveField(patch: Record<string, unknown>) {
    try {
      await update({ data: { id: protocolId, ...patch } as never });
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const { data: udata } = await supabase.auth.getUser();
      const uid = udata.user?.id;
      if (!uid) throw new Error("Nepřihlášen");
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${projectId}/${protocolId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("protocol-photos").upload(path, file, {
          upsert: false,
        });
        if (up.error) throw new Error(up.error.message);
        await registerPhoto({ data: { protocolId, storagePath: path, caption: null } });
      }
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba nahrávání");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function doFinalize() {
    const n = signedByName.trim();
    if (!n) return;
    try {
      await finalize({ data: { id: protocolId, signedByName: n } });
      setFinalizeOpen(false);
      setSignedByName("");
      toast.success("Protokol podepsán");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    }
  }

  async function doReopen() {
    try {
      await reopen({ data: { id: protocolId } });
      toast.success("Protokol otevřen k úpravám");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    }
  }

  async function doDelete() {
    if (!confirm("Opravdu smazat protokol včetně všech fotek?")) return;
    try {
      await del({ data: { id: protocolId } });
      toast.success("Smazáno");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    }
  }

  return (
    <Card className="border-border/60">
      <CardContent className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                {p.reference_number}
              </span>
              <StatusBadge status={p.status} />
            </div>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">{p.title}</h2>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(p.created_at).toLocaleString("cs-CZ")}
              </span>
              {detail.data.authorName && <span>· {detail.data.authorName}</span>}
              {detail.data.floorPlanName && (
                <span className="flex items-center gap-1">
                  · <MapPin className="h-3 w-3" /> {detail.data.floorPlanName}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => exportProtocolPDF({ protocol: p, photos, authorName: detail.data.authorName, floorPlanName: detail.data.floorPlanName })}
            >
              <Download className="h-3.5 w-3.5" /> Export PDF
            </Button>
            {!isFinalized ? (
              <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Podepsat & uzavřít
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-display">Podepsat protokol</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Elektronický podpis. Zaznamená se jméno a čas potvrzení.
                    </p>
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Jméno podepisujícího *
                    </label>
                    <Input
                      value={signedByName}
                      onChange={(e) => setSignedByName(e.target.value)}
                      placeholder="Např. Jan Novák"
                      maxLength={200}
                    />
                  </div>
                  <DialogFooter>
                    <Button onClick={doFinalize} disabled={!signedByName.trim()}>
                      Podepsat
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : canManage ? (
              <Button size="sm" variant="outline" className="gap-2" onClick={doReopen}>
                <RotateCcw className="h-3.5 w-3.5" /> Znovu otevřít
              </Button>
            ) : null}
          </div>
        </div>

        {isFinalized && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
            <div className="flex items-center gap-2 font-mono uppercase tracking-widest text-[10px] text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Podepsáno
            </div>
            <div className="mt-1">
              <strong>{p.signed_by_name}</strong> · {new Date(p.signed_at).toLocaleString("cs-CZ")}
            </div>
          </div>
        )}

        {/* Editable fields */}
        <div className="space-y-3">
          <FieldEditor
            label="Název"
            value={p.title}
            multiline={false}
            disabled={!canEdit}
            onSave={(v) => saveField({ title: v })}
          />
          <FieldEditor
            label="Popis situace"
            value={p.description ?? ""}
            multiline
            disabled={!canEdit}
            onSave={(v) => saveField({ description: v || null })}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Patro / půdorys
              </label>
              <Select
                value={p.floor_plan_id ?? "__none__"}
                onValueChange={(v) => saveField({ floorPlanId: v === "__none__" ? null : v })}
                disabled={!canEdit}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Nevázáno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— nevázáno —</SelectItem>
                  {(fps.data ?? []).map((fp: any) => (
                    <SelectItem key={fp.id} value={fp.id}>
                      {fp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <FieldEditor
              label="Konkrétní místo"
              value={p.location_note ?? ""}
              multiline={false}
              disabled={!canEdit}
              onSave={(v) => saveField({ locationNote: v || null })}
            />
          </div>
          <FieldEditor
            label={
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> Účastníci
              </span>
            }
            value={p.participants ?? ""}
            multiline={false}
            disabled={!canEdit}
            onSave={(v) => saveField({ participants: v || null })}
          />
        </div>

        {/* Photos */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Fotodokumentace ({photos.length})
            </div>
            {canEdit && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => upload(e.target.files)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  {uploading ? "Nahrávám" : "Přidat foto"}
                </Button>
              </>
            )}
          </div>
          {photos.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
              Zatím žádné fotky. Přidejte důkazní fotografie.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {photos.map((ph: any) => (
                <div
                  key={ph.id}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border/60 bg-black/40"
                >
                  {ph.url ? (
                    <img src={ph.url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px]">…</div>
                  )}
                  {canEdit && (
                    <button
                      onClick={async () => {
                        if (!confirm("Smazat fotku?")) return;
                        await delPhoto({ data: { id: ph.id } });
                        invalidate();
                      }}
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        {canEdit && (
          <div className="border-t border-border/50 pt-3">
            <Button size="sm" variant="ghost" onClick={doDelete} className="text-destructive gap-2">
              <Trash2 className="h-3.5 w-3.5" /> Smazat protokol
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FieldEditor({
  label,
  value,
  multiline,
  disabled,
  onSave,
}: {
  label: React.ReactNode;
  value: string;
  multiline: boolean;
  disabled?: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const displayValue = value || (disabled ? "—" : "(prázdné, klikněte pro úpravu)");
  useEffect(() => setDraft(value), [value]);

  if (!editing) {
    return (
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </div>
        <button
          type="button"
          onClick={() => !disabled && setEditing(true)}
          disabled={disabled}
          className={cn(
            "mt-1 w-full rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors",
            !disabled && "hover:border-border/60 hover:bg-muted/30 cursor-text",
            disabled && "text-muted-foreground",
            multiline ? "whitespace-pre-wrap min-h-[1.5rem]" : "truncate",
            !value && "italic text-muted-foreground",
          )}
        >
          {displayValue}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      {multiline ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          autoFocus
          className="mt-1"
        />
      ) : (
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="mt-1"
        />
      )}
      <div className="mt-1 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(draft.trim());
            setEditing(false);
          }}
        >
          Uložit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(value);
            setEditing(false);
          }}
        >
          Zrušit
        </Button>
      </div>
    </div>
  );
}

// ================= PDF EXPORT =================
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function exportProtocolPDF(input: {
  protocol: any;
  photos: Array<{ id: string; url: string | null; caption: string | null }>;
  authorName: string;
  floorPlanName: string | null;
}) {
  const { protocol: p, photos, authorName, floorPlanName } = input;
  const created = new Date(p.created_at).toLocaleString("cs-CZ");
  const signed = p.signed_at ? new Date(p.signed_at).toLocaleString("cs-CZ") : null;

  const photosHtml = photos
    .filter((ph) => ph.url)
    .map(
      (ph) =>
        `<div class="photo"><img src="${escapeHtml(ph.url!)}" alt="" />${
          ph.caption ? `<div class="cap">${escapeHtml(ph.caption)}</div>` : ""
        }</div>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"/>
<title>Protokol · ${escapeHtml(p.reference_number)} · ${escapeHtml(p.title)}</title>
<style>
  @page { size: A4; margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; color: #111; line-height: 1.5; margin: 0; padding: 20px; }
  h1 { font-family: 'Space Grotesk', system-ui, sans-serif; font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-family: 'Space Grotesk', system-ui, sans-serif; font-size: 14px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.15em; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .brand { font-family: 'Space Grotesk'; font-weight: 700; font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase; color: #b8860b; }
  .refnum { font-family: 'Space Grotesk'; font-weight: 700; font-size: 11px; letter-spacing: 0.2em; color: #555; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; font-size: 12px; margin: 8px 0 12px; }
  .meta-grid div span:first-child { color: #666; text-transform: uppercase; font-size: 9px; letter-spacing: 0.15em; display: block; margin-bottom: 2px; font-family: 'Space Grotesk'; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; border: 1px solid; }
  .st-DRAFT { background: #f3f4f6; color: #374151; border-color: #d1d5db; }
  .st-FINALIZED { background: #d1fae5; color: #065f46; border-color: #6ee7b7; }
  .description { background: #f9fafb; padding: 12px; border-left: 3px solid #b8860b; font-size: 12px; white-space: pre-wrap; }
  .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .photo { border: 1px solid #ddd; border-radius: 4px; overflow: hidden; page-break-inside: avoid; }
  .photo img { width: 100%; height: 220px; object-fit: cover; display: block; }
  .photo .cap { padding: 4px 8px; font-size: 10px; color: #666; }
  .signature { margin-top: 20px; border: 2px solid #10b981; background: #ecfdf5; padding: 14px; border-radius: 6px; page-break-inside: avoid; }
  .signature .label { font-family: 'Space Grotesk'; font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em; color: #065f46; }
  .signature .name { font-family: 'Space Grotesk'; font-size: 18px; font-weight: 700; margin-top: 4px; color: #064e3b; }
  .signature .time { font-size: 11px; color: #047857; margin-top: 2px; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10px; color: #666; text-align: center; font-family: 'Space Grotesk'; letter-spacing: 0.1em; text-transform: uppercase; }
  @media print { button { display: none; } body { padding: 0; } }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="brand">PullOps · Protokol</div>
      <h1>${escapeHtml(p.title)}</h1>
      <div class="refnum">${escapeHtml(p.reference_number)}</div>
      <div style="margin-top:6px">
        <span class="badge st-${p.status}">${p.status === "FINALIZED" ? "Podepsáno" : "Rozpracováno"}</span>
      </div>
    </div>
    <div style="text-align:right; font-size:10px; color:#666; font-family:'Space Grotesk'">
      <div>Vygenerováno</div>
      <div style="color:#111; font-weight:600">${new Date().toLocaleString("cs-CZ")}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div><span>Vytvořeno</span><span>${escapeHtml(created)}</span></div>
    <div><span>Autor</span><span>${escapeHtml(authorName || "—")}</span></div>
    <div><span>Patro / půdorys</span><span>${escapeHtml(floorPlanName || "—")}</span></div>
    <div><span>Místo</span><span>${escapeHtml(p.location_note || "—")}</span></div>
    ${p.participants ? `<div style="grid-column:1/-1"><span>Účastníci</span><span>${escapeHtml(p.participants)}</span></div>` : ""}
  </div>

  ${p.description ? `<h2>Popis situace</h2><div class="description">${escapeHtml(p.description)}</div>` : ""}

  ${photosHtml ? `<h2>Fotodokumentace (${photos.length})</h2><div class="photos">${photosHtml}</div>` : ""}

  ${
    signed
      ? `<div class="signature">
        <div class="label">Elektronický podpis</div>
        <div class="name">${escapeHtml(p.signed_by_name || "")}</div>
        <div class="time">Podepsáno: ${escapeHtml(signed)}</div>
      </div>`
      : ""
  }

  <div class="footer">PullOps · ${new Date().getFullYear()} · ${escapeHtml(p.reference_number)}</div>

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
