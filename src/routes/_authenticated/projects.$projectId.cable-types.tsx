import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
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
import { createCableType, deleteCableType, listCableTypes } from "@/lib/cableTypes.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/cable-types")({
  head: () => ({
    meta: [{ title: "Typy kabelů · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: CableTypesPage,
});

function CableTypesPage() {
  const { projectId } = useParams({
    from: "/_authenticated/projects/$projectId/cable-types",
  });
  const listFn = useServerFn(listCableTypes);
  const delFn = useServerFn(deleteCableType);
  const qc = useQueryClient();
  const types = useQuery({
    queryKey: ["cable-types", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  async function remove(id: string) {
    if (!confirm("Smazat typ?")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["cable-types", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Typy kabelů</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Číselník kabelů použitých na projektu s výchozí rezervou (m).
          </p>
        </div>
        <NewTypeDialog projectId={projectId} />
      </header>

      {types.isLoading ? (
        <div className="text-muted-foreground">Načítám…</div>
      ) : !types.data || types.data.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Zatím žádný typ. Přidejte první.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-2">Kód</th>
                <th className="p-2">Popis</th>
                <th className="p-2">Rezerva (m)</th>
                <th className="p-2 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {types.data.map((t) => (
                <tr key={t.id}>
                  <td className="p-2 font-mono">{t.code}</td>
                  <td className="p-2">{t.description ?? "—"}</td>
                  <td className="p-2 font-mono">{Number(t.default_reserve_m).toFixed(2)}</td>
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(t.id)}>
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

function NewTypeDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [desc, setDesc] = useState("");
  const [reserve, setReserve] = useState("3");
  const createFn = useServerFn(createCableType);
  const qc = useQueryClient();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createFn({
        data: {
          projectId,
          code: code.trim(),
          description: desc.trim() || undefined,
          defaultReserveM: Number(reserve) || 0,
        },
      });
      qc.invalidateQueries({ queryKey: ["cable-types", projectId] });
      setOpen(false);
      setCode("");
      setDesc("");
      setReserve("3");
      toast.success("Typ přidán");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Nový typ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový typ kabelu</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Kód</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="Cat6A UTP"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Popis</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Rezerva na koncích (m)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={reserve}
              onChange={(e) => setReserve(e.target.value)}
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
