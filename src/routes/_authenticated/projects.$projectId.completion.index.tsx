import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckSquare, ChevronRight, Layers, ListChecks, Send } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listCompletionOverview, markPlanReadyForCompletion } from "@/lib/completionPlans.functions";
import { getMyProjectCapabilities } from "@/lib/capabilities.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/completion/")({
  component: CompletionIndex,
});

function CompletionIndex() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const overviewFn = useServerFn(listCompletionOverview);
  const markFn = useServerFn(markPlanReadyForCompletion);
  const capsFn = useServerFn(getMyProjectCapabilities);

  const q = useQuery({
    queryKey: ["completion-overview", projectId],
    queryFn: () => overviewFn({ data: { projectId } }),
  });
  const caps = useQuery({
    queryKey: ["me", "project-caps", projectId],
    queryFn: () => capsFn({ data: { projectId } }),
  });
  const canManage = caps.data?.canManage ?? false;

  const plans = q.data?.plans ?? [];
  const readyToMark = plans.filter((p) => p.allPulled && !p.completionReady);
  const inCompletion = plans.filter((p) => p.completionReady);

  async function markReady(planId: string, goTo: boolean) {
    try {
      await markFn({ data: { planId } });
      await qc.invalidateQueries({ queryKey: ["completion-overview", projectId] });
      toast.success("Plán poslán do kompletace");
      if (goTo) navigate({ to: "/projects/$projectId/completion/$planId", params: { projectId, planId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    }
  }

  return (
    <AppShell projectId={projectId}>
      <div className="animate-fade-in space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Projekt / Režim kompletace
            </div>
            <h1 className="mt-1 font-mono text-2xl font-bold uppercase tracking-tight">Režim kompletace</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Vyber plán, na kterém dnes kompletuješ. Endpointy: protaženo → zakončeno (keystone) → otestováno → hotovo.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/projects/$projectId/completion/kanban" params={{ projectId }}>
              <ListChecks className="mr-2 h-4 w-4" /> Kanban kabelů
            </Link>
          </Button>
        </header>

        {readyToMark.length > 0 && canManage && (
          <section className="rounded-sm border border-accent/50 bg-accent/5 p-4">
            <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-accent">
              <Send className="h-4 w-4" /> Připraveno k převzetí z tahání
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {readyToMark.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-sm border border-border bg-card p-2.5">
                  <div>
                    <div className="font-mono text-sm font-bold uppercase">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.floorPlanName ?? "—"} · {p.totalCables} kabelů natažených
                    </div>
                  </div>
                  <Button size="sm" onClick={() => markReady(p.id, true)}>
                    Poslat do kompletace
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {q.isLoading && <div className="text-sm text-muted-foreground">Načítám…</div>}

        {!q.isLoading && inCompletion.length === 0 && (
          <div className="rounded-sm border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Žádný plán zatím není v kompletaci. Až v režimu tahání natáhnete všechny kabely plánu, správce ho pošle sem.
          </div>
        )}

        {inCompletion.length > 0 && (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {inCompletion.map((p) => {
              const pct = p.endpointCount > 0 ? Math.round((p.endpointDone / p.endpointCount) * 100) : 0;
              return (
                <Link
                  key={p.id}
                  to="/projects/$projectId/completion/$planId"
                  params={{ projectId, planId: p.id }}
                  className="group relative overflow-hidden rounded-sm border border-border bg-card transition-colors hover:border-primary"
                >
                  <div className="aspect-[16/10] w-full bg-muted">
                    {p.documentUrl && p.mimeType !== "application/pdf" ? (
                      <img src={p.documentUrl} alt={p.name} className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Layers className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-sm font-bold uppercase">{p.name}</div>
                      {p.floorPlanLevel !== null && (
                        <Badge variant="outline" className="font-mono text-[10px]">Patro {p.floorPlanLevel}</Badge>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{p.endpointCount} endpointů</span>
                      <span>·</span>
                      <span className="font-mono">{p.endpointDone}/{p.endpointCount} hotovo</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
                      <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-end text-xs text-muted-foreground">
                      Otevřít <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        {plans.length > 0 && inCompletion.length === 0 && readyToMark.length === 0 && (
          <div className="rounded-sm border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Zatím žádný plán není 100 % natažený. Vraťte se, až v tahání dokončíte kabely nějakého plánu.
          </div>
        )}
      </div>
    </AppShell>
  );
}
