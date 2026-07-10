import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Server, ChevronRight } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import {
  createPatchPanel,
  deletePatchPanel,
  getPatchPanel,
  listPatchPanels,
} from "@/lib/patchPanels.functions";
import {
  assignPanelToRack,
  createRack,
  deleteRack,
  listRacks,
} from "@/lib/racks.functions";
import { listFloorPlans } from "@/lib/floorPlans.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/patch-panels/")({
  component: PatchPanelsPage,
});

function PatchPanelsPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/patch-panels/" });
  const listPanelsFn = useServerFn(listPatchPanels);
  const listRacksFn = useServerFn(listRacks);
  const listPlansFn = useServerFn(listFloorPlans);
  const delPanelFn = useServerFn(deletePatchPanel);
  const delRackFn = useServerFn(deleteRack);
  const assignFn = useServerFn(assignPanelToRack);
  const qc = useQueryClient();

  const panels = useQuery({
    queryKey: ["patch-panels", projectId],
    queryFn: () => listPanelsFn({ data: { projectId } }),
  });
  const racks = useQuery({
    queryKey: ["racks", projectId],
    queryFn: () => listRacksFn({ data: { projectId } }),
  });
  const plans = useQuery({
    queryKey: ["floor-plans", projectId],
    queryFn: () => listPlansFn({ data: { projectId } }),
  });

  async function removePanel(id: string) {
    if (!confirm("Smazat patch panel? Všechny porty a napojené kabely ztratí vazbu.")) return;
    try {
      await delPanelFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["patch-panels", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }
  async function removeRack(id: string) {
    if (!confirm("Smazat rack? Panely zůstanou, ale ztratí vazbu na rack.")) return;
    try {
      await delRackFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["racks", projectId] });
      qc.invalidateQueries({ queryKey: ["patch-panels", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }
  async function moveToRack(panelId: string, rackId: string | null) {
    try {
      await assignFn({ data: { panelId, rackId } });
      qc.invalidateQueries({ queryKey: ["patch-panels", projectId] });
      toast.success("Přesunuto");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  const panelsByRack = new Map<string | null, typeof panels.data extends undefined ? never : NonNullable<typeof panels.data>>();
  for (const p of panels.data ?? []) {
    const key = p.rack_id ?? null;
    const arr = (panelsByRack.get(key) ?? []) as NonNullable<typeof panels.data>;
    arr.push(p);
    panelsByRack.set(key, arr);
  }

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Racky &amp; Patch panely</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Rack seskupuje patch panely. Každý port drží konkrétní kabel — odtud vzniká trasa.
          </p>
        </div>
        <div className="flex gap-2">
          <NewRackDialog projectId={projectId} plans={plans.data ?? []} />
          <NewPanelDialog projectId={projectId} racks={racks.data ?? []} plans={plans.data ?? []} />
        </div>
      </header>

      {panels.isLoading || racks.isLoading ? (
        <div className="text-muted-foreground">Načítám…</div>
      ) : (
        <div className="space-y-4">
          {(racks.data ?? []).map((r) => (
            <RackCard
              key={r.id}
              rack={r}
              panels={(panelsByRack.get(r.id) ?? []) as NonNullable<typeof panels.data>}
              allRacks={racks.data ?? []}
              projectId={projectId}
              onMove={moveToRack}
              onRemovePanel={removePanel}
              onRemoveRack={removeRack}
            />
          ))}

          {/* Unassigned panels */}
          {(panelsByRack.get(null)?.length ?? 0) > 0 && (
            <div className="rounded-sm border border-dashed border-border p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Bez racku
              </h2>
              <PanelTable
                panels={(panelsByRack.get(null) ?? []) as NonNullable<typeof panels.data>}
                projectId={projectId}
                allRacks={racks.data ?? []}
                onMove={moveToRack}
                onRemove={removePanel}
              />
            </div>
          )}

          {(racks.data?.length ?? 0) === 0 && (panelsByRack.get(null)?.length ?? 0) === 0 && (
            <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Zatím žádný rack ani panel.
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

type Panel = { id: string; code: string; name: string | null; port_count: number; rack_id: string | null };
type Rack = { id: string; code: string; name: string | null };

function RackCard({
  rack,
  panels,
  allRacks,
  projectId,
  onMove,
  onRemovePanel,
  onRemoveRack,
}: {
  rack: Rack;
  panels: Panel[];
  allRacks: Rack[];
  projectId: string;
  onMove: (panelId: string, rackId: string | null) => void;
  onRemovePanel: (id: string) => void;
  onRemoveRack: (id: string) => void;
}) {
  return (
    <div className="rounded-sm border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 p-3">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono font-semibold">{rack.code}</span>
          {rack.name && <span className="text-sm text-muted-foreground">— {rack.name}</span>}
          <Badge variant="secondary" className="ml-2">
            {panels.length} {panels.length === 1 ? "panel" : "panelů"}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onRemoveRack(rack.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {panels.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          V tomto racku zatím není žádný panel.
        </div>
      ) : (
        <PanelTable
          panels={panels}
          projectId={projectId}
          allRacks={allRacks}
          onMove={onMove}
          onRemove={onRemovePanel}
        />
      )}
    </div>
  );
}

function PanelTable({
  panels,
  projectId,
  allRacks,
  onMove,
  onRemove,
}: {
  panels: Panel[];
  projectId: string;
  allRacks: Rack[];
  onMove: (panelId: string, rackId: string | null) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="divide-y divide-border">
      {panels.map((p) => (
        <PanelRow
          key={p.id}
          panel={p}
          projectId={projectId}
          allRacks={allRacks}
          onMove={onMove}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function PanelRow({
  panel,
  projectId,
  allRacks,
  onMove,
  onRemove,
}: {
  panel: Panel;
  projectId: string;
  allRacks: Rack[];
  onMove: (panelId: string, rackId: string | null) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const getFn = useServerFn(getPatchPanel);
  const detail = useQuery({
    queryKey: ["patch-panel", panel.id],
    queryFn: () => getFn({ data: { id: panel.id } }),
    enabled: open,
  });

  return (
    <div>
      <div className="flex items-center gap-2 p-2 hover:bg-muted/30">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <Link
            to="/projects/$projectId/patch-panels/$panelId"
            params={{ projectId, panelId: panel.id }}
            onClick={(e) => e.stopPropagation()}
            className="font-mono hover:underline"
          >
            {panel.code}
          </Link>
          {panel.name && <span className="text-sm text-muted-foreground">— {panel.name}</span>}
          <Badge variant="outline" className="ml-auto mr-2 font-mono">
            {panel.port_count} portů
          </Badge>
        </button>
        <Select
          value={panel.rack_id ?? "__none__"}
          onValueChange={(v) => onMove(panel.id, v === "__none__" ? null : v)}
        >
          <SelectTrigger className="h-8 w-40">
            <SelectValue placeholder="Rack" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Bez racku</SelectItem>
            {allRacks.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={() => onRemove(panel.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="bg-muted/10 px-8 py-3">
          {detail.isLoading ? (
            <div className="text-xs text-muted-foreground">Načítám porty…</div>
          ) : !detail.data ? (
            <div className="text-xs text-muted-foreground">—</div>
          ) : (
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {detail.data.ports.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-sm border border-border/50 bg-background p-1.5 text-xs"
                >
                  <span className="w-8 shrink-0 font-mono text-muted-foreground">
                    #{p.port_number}
                  </span>
                  {p.cable ? (
                    <Link
                      to="/projects/$projectId/cables/$cableId"
                      params={{ projectId, cableId: p.cable.id }}
                      className="flex-1 truncate font-mono hover:underline"
                    >
                      {p.cable.code}
                    </Link>
                  ) : (
                    <span className="flex-1 text-muted-foreground italic">volný</span>
                  )}
                  {p.cable && (
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {p.cable.status}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NewRackDialog({ projectId, plans }: { projectId: string; plans: any[] }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [floorPlanId, setFloorPlanId] = useState<string>("");
  const createFn = useServerFn(createRack);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!floorPlanId) {
      toast.error("Vyber plán");
      return;
    }
    try {
      await createFn({
        data: { projectId, floorPlanId, code: code.trim(), name: name.trim() || undefined },
      });
      qc.invalidateQueries({ queryKey: ["racks", projectId] });
      setOpen(false);
      setCode("");
      setName("");
      toast.success("Rack vytvořen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-1 h-4 w-4" />
          Nový rack
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový rack</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Kód</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="RACK-A" />
          </div>
          <div className="space-y-1.5">
            <Label>Název</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Serverovna 1.NP" />
          </div>
          <div className="space-y-1.5">
            <Label>Plán</Label>
            <Select value={floorPlanId} onValueChange={setFloorPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Vyber plán" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name ?? p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit">Vytvořit</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewPanelDialog({
  projectId,
  racks,
  plans,
}: {
  projectId: string;
  racks: Rack[];
  plans: any[];
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [portCount, setPortCount] = useState(24);
  const [rackId, setRackId] = useState<string>("__none__");
  const [floorPlanId, setFloorPlanId] = useState<string>("__none__");
  const createFn = useServerFn(createPatchPanel);
  const assignFn = useServerFn(assignPanelToRack);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { id } = await createFn({
        data: {
          projectId,
          code: code.trim(),
          name: name.trim() || undefined,
          portCount,
          floorPlanId: floorPlanId === "__none__" ? null : floorPlanId,
        },
      });
      if (rackId !== "__none__") {
        await assignFn({ data: { panelId: id, rackId } });
      }
      qc.invalidateQueries({ queryKey: ["patch-panels", projectId] });
      setOpen(false);
      setCode("");
      setName("");
      setPortCount(24);
      setRackId("__none__");
      toast.success("Patch panel vytvořen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Nový panel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový patch panel</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Kód</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="PP-01" />
          </div>
          <div className="space-y-1.5">
            <Label>Název</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rack A – 1U" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Počet portů</Label>
              <Input
                type="number"
                min={1}
                max={288}
                value={portCount}
                onChange={(e) => setPortCount(Number(e.target.value) || 0)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rack</Label>
              <Select value={rackId} onValueChange={setRackId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Bez racku</SelectItem>
                  {racks.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Plán (volitelné)</Label>
            <Select value={floorPlanId} onValueChange={setFloorPlanId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                {plans.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name ?? p.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit">Vytvořit</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
