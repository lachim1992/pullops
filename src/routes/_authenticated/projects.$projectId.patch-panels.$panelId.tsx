import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Cable as CableIcon, Link2Off, Plug, Plus, Search, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { getPatchPanel, updatePatchPanel, updatePatchPort } from "@/lib/patchPanels.functions";
import { listCables, updateCable } from "@/lib/cables.functions";
import { listEndpoints } from "@/lib/endpoints.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/patch-panels/$panelId")({
  head: () => ({
    meta: [{ title: "Detail patch panelu · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: PatchPanelDetailPage,
});

function PatchPanelDetailPage() {
  const { projectId, panelId } = useParams({
    from: "/_authenticated/projects/$projectId/patch-panels/$panelId",
  });
  const getFn = useServerFn(getPatchPanel);
  const updateFn = useServerFn(updatePatchPanel);
  const updatePortFn = useServerFn(updatePatchPort);
  const listCablesFn = useServerFn(listCables);
  const listEndpointsFn = useServerFn(listEndpoints);
  const updateCableFn = useServerFn(updateCable);
  const qc = useQueryClient();

  const panel = useQuery({
    queryKey: ["patch-panel", panelId],
    queryFn: () => getFn({ data: { id: panelId } }),
  });
  const cablesQ = useQuery({
    queryKey: ["cables", projectId],
    queryFn: () => listCablesFn({ data: { projectId } }),
  });
  const endpointsQ = useQuery({
    queryKey: ["endpoints", projectId],
    queryFn: () => listEndpointsFn({ data: { projectId } }),
  });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [assignPortId, setAssignPortId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkSelected, setBulkSelected] = useState<string[]>([]);


  useEffect(() => {
    const d = panel.data;
    if (!d) return;
    setCode(d.panel.code ?? "");
    setName(d.panel.name ?? "");
    setNotes(d.panel.notes ?? "");
    const map: Record<string, string> = {};
    for (const p of d.ports) map[p.id] = p.label ?? "";
    setLabels(map);
  }, [panel.data]);

  const endpointById = useMemo(() => {
    const m = new Map<string, { code: string; label: string | null }>();
    for (const e of endpointsQ.data ?? []) m.set(e.id, { code: e.code, label: e.label });
    return m;
  }, [endpointsQ.data]);

  const usedFromPorts = useMemo(() => {
    const s = new Set<string>();
    for (const c of cablesQ.data ?? []) {
      const fp = (c as { from_port_id?: string | null }).from_port_id;
      if (fp) s.add(fp);
    }
    return s;
  }, [cablesQ.data]);

  const panelPortIds = useMemo(
    () => new Set((panel.data?.ports ?? []).map((p: any) => p.id as string)),
    [panel.data],
  );

  async function saveHeader() {
    try {
      await updateFn({
        data: {
          id: panelId,
          code: code.trim() || undefined,
          name: name.trim() || null,
          notes: notes.trim() || null,
        },
      });
      toast.success("Uloženo");
      qc.invalidateQueries({ queryKey: ["patch-panel", panelId] });
      qc.invalidateQueries({ queryKey: ["patch-panels", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function savePort(id: string) {
    try {
      const label = labels[id]?.trim() ?? "";
      await updatePortFn({ data: { id, label: label || null } });
      toast.success("Port uložen");
      qc.invalidateQueries({ queryKey: ["patch-panel", panelId] });
      qc.invalidateQueries({ queryKey: ["patch-ports", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function assignCable(cableId: string, portId: string | null) {
    try {
      await updateCableFn({ data: { id: cableId, fromPortId: portId } });
      toast.success(portId ? "Kabel přiřazen k portu" : "Kabel odpojen");
      setAssignPortId(null);
      qc.invalidateQueries({ queryKey: ["patch-panel", panelId] });
      qc.invalidateQueries({ queryKey: ["cables", projectId] });
      qc.invalidateQueries({ queryKey: ["cable", cableId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function bulkAssign() {
    if (!panel.data) return;
    const freePorts = panel.data.ports
      .filter((p: any) => !p.cable)
      .sort((a: any, b: any) => a.port_number - b.port_number);
    if (bulkSelected.length === 0) {
      toast.error("Vyber alespoň jeden kabel");
      return;
    }
    if (bulkSelected.length > freePorts.length) {
      toast.error(`Volných portů je jen ${freePorts.length}, vybráno ${bulkSelected.length}`);
      return;
    }
    try {
      for (let i = 0; i < bulkSelected.length; i++) {
        await updateCableFn({
          data: { id: bulkSelected[i], fromPortId: freePorts[i].id },
        });
      }
      toast.success(`Přiřazeno ${bulkSelected.length} kabelů`);
      setBulkOpen(false);
      setBulkSelected([]);
      setBulkSearch("");
      qc.invalidateQueries({ queryKey: ["patch-panel", panelId] });
      qc.invalidateQueries({ queryKey: ["cables", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  function toggleBulk(cableId: string) {
    setBulkSelected((prev) =>
      prev.includes(cableId) ? prev.filter((x) => x !== cableId) : [...prev, cableId],
    );
  }

  if (panel.isLoading) {

    return (
      <AppShell projectId={projectId}>
        <div className="text-muted-foreground">Načítám…</div>
      </AppShell>
    );
  }
  if (!panel.data) {
    return (
      <AppShell projectId={projectId}>
        <div className="text-muted-foreground">Panel nenalezen.</div>
      </AppShell>
    );
  }

  const cablesForAssign = (cablesQ.data ?? []).filter((c: any) => {
    if (c.status === "CANCELLED") return false;
    const fp = c.from_port_id as string | null;
    // Show cables that are unassigned OR already sit somewhere on THIS panel (allow move)
    return !fp || panelPortIds.has(fp);
  });

  return (
    <AppShell projectId={projectId}>
      <header className="mb-4 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/projects/$projectId/patch-panels" params={{ projectId }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Zpět
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight font-mono">{panel.data.panel.code}</h1>
      </header>

      <div className="mb-6 grid gap-3 rounded-sm border border-border p-4 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1.5">
          <Label>Kód</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Název</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button onClick={saveHeader}>Uložit</Button>
        </div>
        <div className="sm:col-span-3 space-y-1.5">
          <Label>Poznámky</Label>
          <textarea
            className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Porty ({panel.data.ports.length})
        </h2>
        <Button
          size="sm"
          onClick={() => {
            setBulkSelected([]);
            setBulkSearch("");
            setBulkOpen(true);
          }}
        >
          <Plus className="mr-1 h-4 w-4" /> Přidat kabely
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {panel.data.ports.map((p: any) => {
          const cable = p.cable as {
            id: string;
            code: string;
            status: string;
            to_endpoint_id: string | null;
          } | null;
          const ep = cable?.to_endpoint_id ? endpointById.get(cable.to_endpoint_id) : null;
          return (
            <div key={p.id} className="rounded-sm border border-border p-2">
              <div className="flex items-center gap-2">
                <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                  #{p.port_number}
                </span>
                <Input
                  value={labels[p.id] ?? ""}
                  onChange={(e) => setLabels((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="popis / label"
                  className="h-8"
                />
                <Button size="sm" variant="outline" onClick={() => savePort(p.id)}>
                  OK
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-2 pl-12 text-xs">
                {cable ? (
                  <>
                    <Plug className="h-3.5 w-3.5 text-primary" />
                    <Link
                      to="/projects/$projectId/cables/$cableId"
                      params={{ projectId, cableId: cable.id }}
                      className="font-mono text-primary hover:underline"
                    >
                      {cable.code}
                    </Link>
                    {ep && (
                      <span className="text-muted-foreground truncate">
                        → {ep.code}
                        {ep.label ? ` (${ep.label})` : ""}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {cable.status}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-1.5"
                        onClick={() => assignCable(cable.id, null)}
                        title="Odpojit kabel od portu"
                      >
                        <Link2Off className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setAssignPortId(p.id)}
                  >
                    <CableIcon className="mr-1 h-3.5 w-3.5" />
                    Přiřadit kabel…
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CommandDialog
        open={assignPortId !== null}
        onOpenChange={(o) => !o && setAssignPortId(null)}
      >
        <CommandInput placeholder="Hledat kabel podle kódu, endpointu…" />
        <CommandList>
          <CommandEmpty>Žádné volné kabely nenalezeny.</CommandEmpty>
          <CommandGroup heading="Volné kabely">
            {cablesForAssign.map((c: any) => {
              const ep = c.to_endpoint_id ? endpointById.get(c.to_endpoint_id) : null;
              const already = c.from_port_id && c.from_port_id !== assignPortId;
              const searchStr = [c.code, ep?.code, ep?.label, c.status].filter(Boolean).join(" ");
              return (
                <CommandItem
                  key={c.id}
                  value={`${searchStr} ${c.id}`}
                  onSelect={() => assignPortId && assignCable(c.id, assignPortId)}
                  className="flex items-center gap-2"
                >
                  <span className="font-mono text-sm">{c.code}</span>
                  {ep && (
                    <span className="text-xs text-muted-foreground truncate">
                      → {ep.code}
                      {ep.label ? ` · ${ep.label}` : ""}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {already ? "přesun z jiného portu" : c.status}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </AppShell>
  );
}
