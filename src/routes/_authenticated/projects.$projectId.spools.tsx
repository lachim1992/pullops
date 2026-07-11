import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, QrCode, Pencil } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listSpools,
  upsertSpool,
  deleteSpool,
  registerScanCode,
} from "@/lib/spools.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/spools")({
  head: () => ({
    meta: [{ title: "Fyzické spulky · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: SpoolsPage,
});

type SpoolStatus = "WAREHOUSE" | "ON_STATION" | "EMPTY" | "ARCHIVED";

const STATUS_LABEL: Record<SpoolStatus, string> = {
  WAREHOUSE: "Sklad",
  ON_STATION: "Na stanici",
  EMPTY: "Prázdná",
  ARCHIVED: "Archiv",
};

const STATUS_VARIANT: Record<SpoolStatus, "default" | "secondary" | "outline" | "destructive"> = {
  WAREHOUSE: "secondary",
  ON_STATION: "default",
  EMPTY: "outline",
  ARCHIVED: "outline",
};

type SpoolRow = Awaited<ReturnType<typeof listSpools>>["spools"][number];
type CableTypeRow = Awaited<ReturnType<typeof listSpools>>["cableTypes"][number];

function SpoolsPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/spools" });
  const listFn = useServerFn(listSpools);
  const delFn = useServerFn(deleteSpool);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["spools", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  async function remove(id: string) {
    if (!confirm("Smazat spulku?")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["spools", projectId] });
      toast.success("Smazáno");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  const spools = q.data?.spools ?? [];
  const cableTypes = q.data?.cableTypes ?? [];

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fyzické spulky</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Skladová evidence spulek — QR kódy, typy kabelu, aktuální metry a stav.
          </p>
        </div>
        <SpoolDialog projectId={projectId} cableTypes={cableTypes} />
      </header>

      {q.isLoading ? (
        <div className="text-muted-foreground">Načítám…</div>
      ) : spools.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Zatím žádná spulka. Přidejte první.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-2">Serial</th>
                <th className="p-2">Typ</th>
                <th className="p-2">Výrobce / šarže</th>
                <th className="p-2 text-right">Zbývá / start (m)</th>
                <th className="p-2">Stav</th>
                <th className="p-2 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {spools.map((s) => (
                <tr key={s.id}>
                  <td className="p-2 font-mono">{s.serialNo}</td>
                  <td className="p-2 font-mono">{s.cableTypeCode ?? "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {s.manufacturer ?? "—"}
                    {s.batchNo ? ` · ${s.batchNo}` : ""}
                  </td>
                  <td className="p-2 text-right font-mono">
                    {s.currentLengthM.toFixed(1)} / {s.initialLengthM.toFixed(1)}
                  </td>
                  <td className="p-2">
                    <Badge variant={STATUS_VARIANT[s.status as SpoolStatus]} className="font-mono text-[10px]">
                      {STATUS_LABEL[s.status as SpoolStatus] ?? s.status}
                    </Badge>
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-1">
                      <QrDialog projectId={projectId} spool={s} />
                      <SpoolDialog projectId={projectId} cableTypes={cableTypes} spool={s} />
                      <Button variant="ghost" size="icon" onClick={() => remove(s.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function SpoolDialog({
  projectId,
  cableTypes,
  spool,
}: {
  projectId: string;
  cableTypes: CableTypeRow[];
  spool?: SpoolRow;
}) {
  const [open, setOpen] = useState(false);
  const editing = !!spool;
  const [serial, setSerial] = useState(spool?.serialNo ?? "");
  const [cableTypeId, setCableTypeId] = useState<string>(spool?.cableTypeId ?? "");
  const [manufacturer, setManufacturer] = useState(spool?.manufacturer ?? "");
  const [batch, setBatch] = useState(spool?.batchNo ?? "");
  const [initial, setInitial] = useState(String(spool?.initialLengthM ?? "305"));
  const [current, setCurrent] = useState(String(spool?.currentLengthM ?? "305"));
  const [status, setStatus] = useState<SpoolStatus>((spool?.status as SpoolStatus) ?? "WAREHOUSE");
  const [notes, setNotes] = useState(spool?.notes ?? "");
  const upFn = useServerFn(upsertSpool);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await upFn({
        data: {
          id: spool?.id,
          projectId,
          serialNo: serial.trim(),
          cableTypeId: cableTypeId ? cableTypeId : null,
          manufacturer: manufacturer.trim() || null,
          batchNo: batch.trim() || null,
          initialLengthM: Number(initial) || 0,
          currentLengthM: Number(current) || 0,
          status,
          notes: notes.trim() || null,
        },
      });
      qc.invalidateQueries({ queryKey: ["spools", projectId] });
      setOpen(false);
      toast.success(editing ? "Uloženo" : "Spulka přidána");
      if (!editing) {
        setSerial("");
        setManufacturer("");
        setBatch("");
        setNotes("");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="icon">
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-1 h-4 w-4" />
            Nová spulka
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Upravit spulku" : "Nová spulka"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Serial / štítek</Label>
            <Input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              required
              placeholder="SP-0001"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Typ kabelu</Label>
              <Select
                value={cableTypeId || "__none"}
                onValueChange={(v) => setCableTypeId(v === "__none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">—</SelectItem>
                  {cableTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Stav</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as SpoolStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as SpoolStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Výrobce</Label>
              <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Šarže</Label>
              <Input value={batch} onChange={(e) => setBatch(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Původní délka (m)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={initial}
                onChange={(e) => setInitial(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Aktuální (m)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Poznámky</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit">{editing ? "Uložit" : "Vytvořit"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({ projectId, spool }: { projectId: string; spool: SpoolRow }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"QR" | "BARCODE" | "MANUAL">("QR");
  const regFn = useServerFn(registerScanCode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await regFn({
        data: {
          projectId,
          entityType: "SPOOL",
          entityId: spool.id,
          code: code.trim(),
          codeKind: kind,
        },
      });
      toast.success("QR kód přiřazen");
      setOpen(false);
      setCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Přiřadit QR / kód">
          <QrCode className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>QR / kód pro {spool.serialNo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Naskenovaný / zadaný kód</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              placeholder="Naskenujte nebo vložte"
            />
            <p className="text-xs text-muted-foreground">
              Nahradí případný stávající kód této spulky.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Typ kódu</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="QR">QR</SelectItem>
                <SelectItem value="BARCODE">Čárový kód</SelectItem>
                <SelectItem value="MANUAL">Ruční</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit">Uložit kód</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
