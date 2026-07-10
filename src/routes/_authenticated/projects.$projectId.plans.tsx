import { useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Map, Plus, Trash2 } from "lucide-react";

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
import { listProjectDocuments } from "@/lib/documents.functions";
import {
  createFloorPlan,
  deleteFloorPlan,
  listFloorPlans,
} from "@/lib/floorPlans.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/plans")({
  head: () => ({
    meta: [{ title: "Plány · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: PlansPage,
});

function PlansPage() {
  const { projectId } = useParams({
    from: "/_authenticated/projects/$projectId/plans",
  });
  const listFn = useServerFn(listFloorPlans);
  const deleteFn = useServerFn(deleteFloorPlan);
  const qc = useQueryClient();

  const plans = useQuery({
    queryKey: ["plans", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  async function remove(id: string) {
    if (!confirm("Smazat plán?")) return;
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["plans", projectId] });
  }

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Plány</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Půdorysy s dvoubodovou kalibrací, endpointy a trasy.
          </p>
        </div>
        <NewPlanDialog projectId={projectId} />
      </header>

      {plans.isLoading ? (
        <div className="text-muted-foreground">Načítám…</div>
      ) : !plans.data || plans.data.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Zatím žádný plán.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {plans.data.map((p) => (
            <div
              key={p.id}
              className="rounded-sm border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between">
                <Map className="h-5 w-5 text-accent" />
                <Button variant="ghost" size="icon" onClick={() => remove(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-3 font-mono text-xs text-muted-foreground">
                Úroveň {p.level}
              </div>
              <div className="mt-1 font-semibold">{p.name}</div>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link
                  to="/projects/$projectId/plans/$planId"
                  params={{ projectId, planId: p.id }}
                >
                  Otevřít editor
                </Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function NewPlanDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [level, setLevel] = useState("0");
  const [documentId, setDocumentId] = useState<string | undefined>(undefined);
  const createFn = useServerFn(createFloorPlan);
  const listDocs = useServerFn(listProjectDocuments);
  const docs = useQuery({
    queryKey: ["docs", projectId],
    queryFn: () => listDocs({ data: { projectId } }),
    enabled: open,
  });
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createFn({
        data: {
          projectId,
          name: name.trim(),
          level: Number(level) || 0,
          documentId: documentId ?? null,
        },
      });
      toast.success("Plán vytvořen");
      setOpen(false);
      setName("");
      setLevel("0");
      setDocumentId(undefined);
      qc.invalidateQueries({ queryKey: ["plans", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Nový plán
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový plán</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Název</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Úroveň (patro)</Label>
            <Input
              type="number"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Podkladový dokument (nepovinné)</Label>
            <Select
              value={documentId ?? "__none__"}
              onValueChange={(v) => setDocumentId(v === "__none__" ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Bez podkladu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Bez podkladu</SelectItem>
                {(docs.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit">
              <Loader2 className="mr-2 hidden h-4 w-4 animate-spin" />
              Vytvořit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
