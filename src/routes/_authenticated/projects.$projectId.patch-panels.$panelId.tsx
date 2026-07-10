import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPatchPanel,
  updatePatchPanel,
  updatePatchPort,
} from "@/lib/patchPanels.functions";

export const Route = createFileRoute(
  "/_authenticated/projects/$projectId/patch-panels/$panelId",
)({
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
  const qc = useQueryClient();

  const panel = useQuery({
    queryKey: ["patch-panel", panelId],
    queryFn: () => getFn({ data: { id: panelId } }),
  });

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [labels, setLabels] = useState<Record<string, string>>({});

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

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Porty ({panel.data.ports.length})
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {panel.data.ports.map((p) => (
          <div key={p.id} className="flex items-center gap-2 rounded-sm border border-border p-2">
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
        ))}
      </div>
    </AppShell>
  );
}
