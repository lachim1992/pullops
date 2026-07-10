import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

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
  createPatchPanel,
  deletePatchPanel,
  listPatchPanels,
} from "@/lib/patchPanels.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/patch-panels/")({
  component: PatchPanelsPage,
});

function PatchPanelsPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/patch-panels/" });
  const listFn = useServerFn(listPatchPanels);
  const delFn = useServerFn(deletePatchPanel);
  const qc = useQueryClient();

  const panels = useQuery({
    queryKey: ["patch-panels", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  async function remove(id: string) {
    if (!confirm("Smazat patch panel? Všechny porty a napojené kabely ztratí vazbu.")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["patch-panels", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patch panely</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Patch panely a jejich porty. Porty se generují automaticky podle počtu.
          </p>
        </div>
        <NewPanelDialog projectId={projectId} />
      </header>

      {panels.isLoading ? (
        <div className="text-muted-foreground">Načítám…</div>
      ) : !panels.data || panels.data.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Zatím žádný patch panel.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-2">Kód</th>
                <th className="p-2">Název</th>
                <th className="p-2">Porty</th>
                <th className="p-2 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {panels.data.map((p) => (
                <tr key={p.id}>
                  <td className="p-2 font-mono">
                    <Link
                      to="/projects/$projectId/patch-panels/$panelId"
                      params={{ projectId, panelId: p.id }}
                      className="hover:underline"
                    >
                      {p.code}
                    </Link>
                  </td>
                  <td className="p-2">{p.name ?? "—"}</td>
                  <td className="p-2 font-mono">{p.port_count}</td>
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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

function NewPanelDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [portCount, setPortCount] = useState(24);
  const createFn = useServerFn(createPatchPanel);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createFn({ data: { projectId, code: code.trim(), name: name.trim() || undefined, portCount } });
      qc.invalidateQueries({ queryKey: ["patch-panels", projectId] });
      setOpen(false);
      setCode("");
      setName("");
      setPortCount(24);
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
          <DialogFooter>
            <Button type="submit">Vytvořit</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}