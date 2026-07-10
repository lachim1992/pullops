import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { listEndpoints, deleteEndpoint } from "@/lib/endpoints.functions";
import { listFloorPlans } from "@/lib/floorPlans.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/endpoints")({
  head: () => ({
    meta: [{ title: "Endpointy · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: EndpointsPage,
});

function EndpointsPage() {
  const { projectId } = useParams({
    from: "/_authenticated/projects/$projectId/endpoints",
  });
  const listFn = useServerFn(listEndpoints);
  const delFn = useServerFn(deleteEndpoint);
  const listPlansFn = useServerFn(listFloorPlans);
  const qc = useQueryClient();

  const eps = useQuery({
    queryKey: ["endpoints", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const plans = useQuery({
    queryKey: ["plans", projectId],
    queryFn: () => listPlansFn({ data: { projectId } }),
  });
  const planName = (id: string) =>
    (plans.data ?? []).find((p) => p.id === id)?.name ?? "—";

  async function remove(id: string) {
    if (!confirm("Smazat endpoint?")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["endpoints", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Endpointy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fyzické koncové body — přidávejte je klikáním v editoru plánu.
        </p>
      </header>

      {eps.isLoading ? (
        <div className="text-muted-foreground">Načítám…</div>
      ) : !eps.data || eps.data.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Zatím žádný endpoint. Přejděte do editoru plánu a klikáním je přidejte.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-2">Kód</th>
                <th className="p-2">Popis</th>
                <th className="p-2">Typ</th>
                <th className="p-2">Plán</th>
                <th className="p-2 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {eps.data.map((e) => (
                <tr key={e.id}>
                  <td className="p-2 font-mono">{e.code}</td>
                  <td className="p-2">{e.label ?? "—"}</td>
                  <td className="p-2 font-mono text-xs">{e.endpoint_kind}</td>
                  <td className="p-2">{planName(e.floor_plan_id)}</td>
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(e.id)}>
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
